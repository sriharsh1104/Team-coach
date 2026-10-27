import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { join } from 'path';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService, PushMessage } from '../common/push-notification.service';
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
  ) {}

  async saveUpload(
    userId: string,
    fileKey: string,
    dto: UploadMediaDto,
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
        type: dto.type,
        fileKey,
        caption: dto.caption,
      },
    });

    this.notifyCoaches(membership.orgId, userId, membership.user.name, dto.type).catch(
      (err) => this.logger.warn(`Push notification failed: ${err.message}`),
    );

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

  // <Image>/<Video> components and Linking.openURL (used for video playback)
  // can't attach an Authorization header, so file URLs carry a short-lived,
  // single-file-scoped signed token instead of requiring the long-lived
  // session JWT in the query string — a much smaller leak surface (one file,
  // 15 minutes) than passing the main bearer token around.
  async buildFileUrl(fileKey: string, userId: string): Promise<string> {
    const payload: FileTokenPayload = { sub: userId, fileKey, purpose: 'media-file' };
    const token = await this.jwtService.signAsync(payload, { expiresIn: '15m' });
    return `/media/files/${fileKey}?token=${token}`;
  }

  async getFileForDownload(fileKey: string, token: string | undefined) {
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
    // Re-check org membership at request time (not just at the moment the
    // token was issued) — same 404-not-403 pattern used everywhere else in
    // this codebase, so a guess can't distinguish "no such file" from "that
    // file exists but isn't yours".
    const post = membership
      ? await this.prisma.mediaPost.findUnique({ where: { fileKey } })
      : null;
    if (!membership || !post || post.orgId !== membership.orgId) {
      throw new NotFoundException('File not found');
    }

    const uploadDir = join(process.cwd(), process.env.MEDIA_UPLOAD_DIR ?? 'uploads');
    return { filePath: join(uploadDir, fileKey) };
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
