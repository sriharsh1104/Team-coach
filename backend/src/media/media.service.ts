import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService, PushMessage } from '../common/push-notification.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MediaStorageService } from './media-storage.service';
import { UploadMediaDto } from './dto/upload-media.dto';

interface FileTokenPayload {
  sub: string;
  fileKey: string;
  purpose: 'media-file';
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationService,
    private readonly jwtService: JwtService,
    private readonly realtime: RealtimeService,
    private readonly storage: MediaStorageService,
  ) {}

  async saveUpload(
    userId: string,
    fileKey: string,
    dto: UploadMediaDto,
  ) {
    return this.createPost(userId, fileKey, dto.type, dto.caption);
  }

  // Shared by the /media upload endpoint and chat's media upload (which
  // mirrors every chat image/video into the Media feed too, so Stats
  // extraction keeps working now that /media has no dedicated upload UI).
  async createPost(
    userId: string,
    fileKey: string,
    type: 'IMAGE' | 'VIDEO',
    caption?: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('You must be in an org to upload media');
    }

    const post = await this.prisma.mediaPost.create({
      data: {
        orgId: membership.orgId,
        uploaderId: userId,
        type,
        fileKey,
        caption: caption ?? null,
      },
    });

    this.notifyCoaches(membership.orgId, userId, membership.user.name, type).catch(
      (err) => this.logger.warn(`Push notification failed: ${err.message}`),
    );
    this.realtime.publish(membership.orgId, 'media.changed');

    return this.toResponse(post, membership.user.name, userId);
  }

  async listOrgMedia(userId: string, uploaderId?: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
    });
    if (!membership) {
      throw new NotFoundException('You are not part of an org yet');
    }

    const posts = await this.prisma.mediaPost.findMany({
      where: {
        orgId: membership.orgId,
        ...(uploaderId ? { uploaderId } : {}),
      },
      include: { uploader: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      posts.map((post) => this.toResponse(post, post.uploader.name, userId)),
    );
  }

  async buildFileUrl(fileKey: string, userId: string): Promise<string> {
    const cloudUrl = this.storage.buildDeliveryUrl(fileKey);
    if (cloudUrl) return cloudUrl;

    const payload: FileTokenPayload = { sub: userId, fileKey, purpose: 'media-file' };
    const token = await this.jwtService.signAsync(payload, { expiresIn: '15m' });
    // Encode so Cloudinary-style keys with `/` survive path params if ever used.
    return `/media/files/${encodeURIComponent(fileKey)}?token=${token}`;
  }

  async getFileForDownload(fileKey: string, token: string | undefined): Promise<{
    filePath?: string;
    redirectUrl?: string;
  }> {
    let payload: FileTokenPayload | undefined;
    if (token) {
      try {
        payload = await this.jwtService.verifyAsync<FileTokenPayload>(token);
      } catch {
        payload = undefined;
      }
    }
    if (!payload || payload.purpose !== 'media-file' || payload.fileKey !== fileKey) {
      throw new NotFoundException('File not found');
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: payload.sub },
    });
    const post = membership
      ? await this.prisma.mediaPost.findUnique({ where: { fileKey } })
      : null;
    if (!membership || !post || post.orgId !== membership.orgId) {
      throw new NotFoundException('File not found');
    }

    if (this.storage.isCloudinaryKey(fileKey)) {
      const redirectUrl = this.storage.buildDeliveryUrl(fileKey);
      if (!redirectUrl) throw new NotFoundException('File not found');
      return { redirectUrl };
    }

    return { filePath: this.storage.localFilePath(fileKey) };
  }

  private async toResponse(
    post: {
      id: string;
      type: string;
      fileKey: string;
      caption: string | null;
      createdAt: Date;
      uploaderId: string;
    },
    uploaderName: string,
    viewerUserId: string,
  ) {
    return {
      id: post.id,
      type: post.type,
      url: await this.buildFileUrl(post.fileKey, viewerUserId),
      caption: post.caption,
      createdAt: post.createdAt,
      uploaderId: post.uploaderId,
      uploaderName,
    };
  }

  private async notifyCoaches(
    orgId: string,
    uploaderId: string,
    uploaderName: string,
    type: 'IMAGE' | 'VIDEO',
  ) {
    const coachMemberships = await this.prisma.membership.findMany({
      where: {
        orgId,
        role: MembershipRole.COACH,
        userId: { not: uploaderId },
      },
      include: { user: true },
    });

    const messages: PushMessage[] = coachMemberships
      .filter((m) => this.pushNotifications.isValidExpoPushToken(m.user.expoPushToken))
      .map((m) => ({
        to: m.user.expoPushToken as string,
        title: 'New upload',
        body: `${uploaderName} uploaded a ${type.toLowerCase()}`,
        data: { kind: 'media-upload' },
      }));

    await this.pushNotifications.send(messages);
  }
}
