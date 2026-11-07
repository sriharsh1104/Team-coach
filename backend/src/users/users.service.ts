import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MediaStorageService } from '../media/media-storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { SetPushTokenDto } from './dto/set-push-token.dto';

const PROFILE_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  roles: true,
  inGameName: true,
  inGameUid: true,
  phone: true,
  whatsappUrl: true,
  instagramUrl: true,
  discordUrl: true,
  youtubeUrl: true,
  devices: {
    select: { id: true, name: true, model: true },
  },
} as const;

/** Peer profiles: game + devices + social — never phone or email. */
const PEER_PROFILE_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  roles: true,
  inGameName: true,
  inGameUid: true,
  whatsappUrl: true,
  instagramUrl: true,
  discordUrl: true,
  youtubeUrl: true,
  devices: {
    select: { id: true, name: true, model: true },
  },
} as const;

// A profile counts as complete once the three compulsory fields are filled —
// everything else (social links) stays optional. Shared by the forced
// post-login gate (AuthService/AuthController) and anywhere else that needs
// to know whether a user still owes us this info.
export function isProfileComplete(user: {
  inGameName?: string | null;
  inGameUid?: string | null;
  phone?: string | null;
}): boolean {
  return !!(user.inGameName && user.inGameUid && user.phone);
}

/** Digits only; strip IN trunk `0` / country `91` so +91-… and 10-digit match. */
export function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    private readonly jwtService: JwtService,
  ) {}

  private async resolveAvatarUrl(
    avatarUrl: string | null | undefined,
    avatarFileKey: string | null | undefined,
    viewerId: string,
  ) {
    if (avatarFileKey) {
      const cloud = this.storage.buildDeliveryUrl(avatarFileKey);
      if (cloud) return cloud;
      const token = await this.jwtService.signAsync(
        { sub: viewerId, fileKey: avatarFileKey, purpose: 'media-file' },
        { expiresIn: '7d' },
      );
      return `/media/files/${encodeURIComponent(avatarFileKey)}?token=${token}`;
    }
    return avatarUrl ?? null;
  }

  /**
   * Upload a new profile photo and delete the previous stored file so the
   * DB / CDN never keep both the old and new avatar.
   */
  async setMyAvatar(userId: string, file: Express.Multer.File) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarFileKey: true },
    });
    const stored = await this.storage.storeUploadedFile(file);
    // Persist fileKey as source of truth; URL is reminted on read.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarFileKey: stored.fileKey,
        avatarUrl: stored.deliveryUrl,
      },
      select: { ...PROFILE_SELECT, avatarFileKey: true },
    });

    if (
      existing?.avatarFileKey &&
      existing.avatarFileKey !== stored.fileKey
    ) {
      await this.storage.deleteFile(existing.avatarFileKey);
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId },
    });
    const { avatarFileKey, ...rest } = updated;
    return {
      ...rest,
      avatarUrl: await this.resolveAvatarUrl(
        rest.avatarUrl,
        avatarFileKey,
        userId,
      ),
      role: membership?.role ?? null,
      isOwner: membership?.isOwner ?? false,
    };
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const data: UpdateProfileDto = { ...dto };
    if (typeof data.phone === 'string') {
      data.phone = normalizePhone(data.phone);
    }
    if (typeof data.inGameName === 'string') {
      data.inGameName = data.inGameName.trim();
    }
    if (typeof data.inGameUid === 'string') {
      data.inGameUid = data.inGameUid.trim();
    }

    await this.assertUniqueProfileFields(userId, data);

    try {
      const [updated, membership] = await Promise.all([
        this.prisma.user.update({
          where: { id: userId },
          data,
          select: PROFILE_SELECT,
        }),
        this.prisma.membership.findFirst({ where: { userId } }),
      ]);
      return {
        ...updated,
        role: membership?.role ?? null,
        isOwner: membership?.isOwner ?? false,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(this.uniqueConflictMessage(err));
      }
      throw err;
    }
  }

  private async assertUniqueProfileFields(
    userId: string,
    data: UpdateProfileDto,
  ) {
    if (data.phone) {
      const taken = await this.prisma.user.findFirst({
        where: { phone: data.phone, id: { not: userId } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('That phone number is already in use');
      }
    }

    if (data.inGameName) {
      const taken = await this.prisma.user.findFirst({
        where: {
          inGameName: { equals: data.inGameName, mode: 'insensitive' },
          id: { not: userId },
        },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('That in-game name is already in use');
      }
    }

    if (data.inGameUid) {
      const taken = await this.prisma.user.findFirst({
        where: {
          inGameUid: { equals: data.inGameUid, mode: 'insensitive' },
          id: { not: userId },
        },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('That UID is already in use');
      }
    }
  }

  private uniqueConflictMessage(err: Prisma.PrismaClientKnownRequestError) {
    const target = err.meta?.target;
    const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
    if (fields.includes('phone')) return 'That phone number is already in use';
    if (fields.includes('inGameName')) {
      return 'That in-game name is already in use';
    }
    if (fields.includes('inGameUid')) return 'That UID is already in use';
    if (fields.includes('email')) return 'That email is already in use';
    return 'That value is already in use';
  }

  async getMyProfile(userId: string) {
    const [profile, membership] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { ...PROFILE_SELECT, avatarFileKey: true },
      }),
      this.prisma.membership.findFirst({ where: { userId } }),
    ]);
    const { avatarFileKey, ...rest } = profile;
    return {
      ...rest,
      avatarUrl: await this.resolveAvatarUrl(
        rest.avatarUrl,
        avatarFileKey,
        userId,
      ),
      role: membership?.role ?? null,
      isOwner: membership?.isOwner ?? false,
    };
  }

  async listMyDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addDevice(userId: string, dto: CreateDeviceDto) {
    return this.prisma.device.create({
      data: { userId, name: dto.name, model: dto.model },
    });
  }

  async removeDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device || device.userId !== userId) {
      throw new NotFoundException('Device not found');
    }
    await this.prisma.device.delete({ where: { id: deviceId } });
  }

  async setPushToken(userId: string, dto: SetPushTokenDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: dto.token },
    });
  }

  async getMemberProfile(requesterId: string, targetUserId: string) {
    if (requesterId === targetUserId) {
      return this.getMyProfile(requesterId);
    }

    const [
      requesterMembership,
      targetMembership,
      requesterGuild,
      targetGuild,
    ] = await Promise.all([
      this.prisma.membership.findFirst({ where: { userId: requesterId } }),
      this.prisma.membership.findFirst({ where: { userId: targetUserId } }),
      this.prisma.guildMembership.findFirst({ where: { userId: requesterId } }),
      this.prisma.guildMembership.findFirst({ where: { userId: targetUserId } }),
    ]);

    const shareRoster =
      !!requesterMembership &&
      !!targetMembership &&
      requesterMembership.orgId === targetMembership.orgId;
    const shareGuild =
      !!requesterGuild &&
      !!targetGuild &&
      requesterGuild.orgId === targetGuild.orgId;

    if (!shareRoster && !shareGuild) {
      throw new ForbiddenException(
        'You can only view profiles of members in your own org',
      );
    }

    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: PEER_PROFILE_SELECT,
    });

    return {
      ...profile,
      phone: null,
      role: targetMembership?.role ?? null,
      isOwner: targetMembership?.isOwner ?? false,
    };
  }
}
