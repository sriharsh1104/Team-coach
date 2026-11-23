import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PushNotificationService,
  PushMessage,
} from '../common/push-notification.service';
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

  async saveUpload(userId: string, fileKey: string, dto: UploadMediaDto) {
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

    this.logger.log(
      `[media] MediaPost created id=${post.id} org=${membership.orgId} uploader=${userId} type=${type} fileKey=${fileKey}`,
    );

    this.notifyCoaches(
      membership.orgId,
      userId,
      membership.user.name,
      type,
    ).catch((err) =>
      this.logger.warn(`Push notification failed: ${err.message}`),
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

    const payload: FileTokenPayload = {
      sub: userId,
      fileKey,
      purpose: 'media-file',
    };
    const token = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });
    // Encode so Cloudinary-style keys with `/` survive path params if ever used.
    return `/media/files/${encodeURIComponent(fileKey)}?token=${token}`;
  }

  async getFileForDownload(
    fileKey: string,
    token: string | undefined,
  ): Promise<{
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
    if (
      !payload ||
      payload.purpose !== 'media-file' ||
      payload.fileKey !== fileKey
    ) {
      throw new NotFoundException('File not found');
    }

    if (!(await this.viewerMayDownload(payload.sub, fileKey))) {
      throw new NotFoundException('File not found');
    }

    if (this.storage.isCloudinaryKey(fileKey)) {
      const redirectUrl = this.storage.buildDeliveryUrl(fileKey);
      if (!redirectUrl) throw new NotFoundException('File not found');
      return { redirectUrl };
    }

    return { filePath: this.storage.localFilePath(fileKey) };
  }

  /**
   * A signed file token proves the viewer was allowed to see `fileKey` when
   * it was minted; this re-checks that against what the key is *now*:
   *  - a Media-feed post → viewer must still be in that org
   *  - a group-chat (org / guild) photo → viewer must still be in that org
   *  - a member's profile avatar → any signed-in viewer (profile pictures are
   *    shown org-wide in chat, rosters and member lists)
   * Avatars are stored by MediaStorageService without a MediaPost row, so the
   * old post-only check 404'd every locally-stored avatar — the mobile app
   * then silently fell back to the placeholder after a "successful" upload.
   */
  private async viewerMayDownload(
    viewerId: string,
    fileKey: string,
  ): Promise<boolean> {
    const [rosterOrgs, guildOrgs] = await Promise.all([
      this.prisma.membership.findMany({
        where: { userId: viewerId },
        select: { orgId: true },
      }),
      this.prisma.guildMembership.findMany({
        where: { userId: viewerId },
        select: { orgId: true },
      }),
    ]);
    const viewerOrgIds = new Set(
      [...rosterOrgs, ...guildOrgs].map((m) => m.orgId),
    );

    const post = await this.prisma.mediaPost.findUnique({
      where: { fileKey },
      select: { orgId: true },
    });
    if (post) return viewerOrgIds.has(post.orgId);

    const channelMeta = await this.prisma.chatChannelMeta.findFirst({
      where: { avatarFileKey: fileKey },
      select: { orgId: true },
    });
    if (channelMeta) return viewerOrgIds.has(channelMeta.orgId);

    const achievement = await this.prisma.orgAchievement.findFirst({
      where: { pointsTableFileKey: fileKey },
      select: { orgId: true },
    });
    if (achievement) return viewerOrgIds.has(achievement.orgId);

    const avatarOwner = await this.prisma.user.findFirst({
      where: { avatarFileKey: fileKey },
      select: { id: true },
    });
    return !!avatarOwner;
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

    const messages: PushMessage[] = [];
    for (const m of coachMemberships) {
      for (const to of this.pushNotifications.tokensFor(m.user.expoPushToken)) {
        messages.push({
          to,
          title: 'New upload',
          body: `${uploaderName} uploaded a ${type.toLowerCase()}`,
          data: { kind: 'media-upload' },
        });
      }
    }

    await this.pushNotifications.send(messages);
  }
}
