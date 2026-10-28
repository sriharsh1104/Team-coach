import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const [updated, membership] = await Promise.all([
      this.prisma.user.update({
        where: { id: userId },
        data: dto,
        select: PROFILE_SELECT,
      }),
      this.prisma.membership.findFirst({ where: { userId } }),
    ]);
    return {
      ...updated,
      role: membership?.role ?? null,
      isOwner: membership?.isOwner ?? false,
    };
  }

  async getMyProfile(userId: string) {
    const [profile, membership] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: PROFILE_SELECT,
      }),
      this.prisma.membership.findFirst({ where: { userId } }),
    ]);
    return {
      ...profile,
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

    const [requesterMembership, targetMembership] = await Promise.all([
      this.prisma.membership.findFirst({ where: { userId: requesterId } }),
      this.prisma.membership.findFirst({ where: { userId: targetUserId } }),
    ]);

    const shareOrg =
      requesterMembership &&
      targetMembership &&
      requesterMembership.orgId === targetMembership.orgId;

    if (!shareOrg) {
      throw new ForbiddenException(
        'You can only view profiles of members in your own org',
      );
    }

    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: PROFILE_SELECT,
    });

    return {
      ...profile,
      role: targetMembership.role,
      isOwner: targetMembership.isOwner,
    };
  }
}
