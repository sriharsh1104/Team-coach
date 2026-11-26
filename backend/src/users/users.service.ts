import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MediaStorageService } from '../media/media-storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertGameProfileDto } from './dto/upsert-game-profile.dto';
import { GameProfileVisibilityDto } from './dto/game-profile-visibility.dto';
import { ConfirmAccountActionDto } from './dto/confirm-account-action.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { SetPushTokenDto } from './dto/set-push-token.dto';
import { mergePushToken, removePushToken } from '../common/push-tokens';
import {
  GameId,
  isGameId,
  isRoleForGame,
  uidLooksValid,
} from './game-profiles';

const GAME_PROFILE_SELECT = {
  game: true,
  inGameName: true,
  inGameUid: true,
  role: true,
  showNameToMembers: true,
  showUidToMembers: true,
} as const;

const PROFILE_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  roles: true,
  inGameName: true,
  inGameUid: true,
  phone: true,
  phoneVerifiedAt: true,
  whatsappUrl: true,
  instagramUrl: true,
  discordUrl: true,
  youtubeUrl: true,
  kickUrl: true,
  showPhoneToMembers: true,
  showWhatsappToMembers: true,
  showInstagramToMembers: true,
  showDiscordToMembers: true,
  showYoutubeToMembers: true,
  showKickToMembers: true,
  devices: {
    select: { id: true, name: true, model: true },
  },
  gameProfiles: {
    select: GAME_PROFILE_SELECT,
    orderBy: { game: 'asc' as const },
  },
} as const;

/**
 * Peer profiles: game + devices + social/phone gated by the owner's
 * show*ToMembers flags. Email / passwordHash are never selected.
 */
const PEER_PROFILE_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  roles: true,
  inGameName: true,
  inGameUid: true,
  phone: true,
  phoneVerifiedAt: true,
  whatsappUrl: true,
  instagramUrl: true,
  discordUrl: true,
  youtubeUrl: true,
  kickUrl: true,
  showPhoneToMembers: true,
  showWhatsappToMembers: true,
  showInstagramToMembers: true,
  showDiscordToMembers: true,
  showYoutubeToMembers: true,
  showKickToMembers: true,
  devices: {
    select: { id: true, name: true, model: true },
  },
  gameProfiles: {
    select: GAME_PROFILE_SELECT,
    orderBy: { game: 'asc' as const },
  },
} as const;

// A profile counts as complete once the three compulsory fields are filled —
// everything else (social links) stays optional. Shared by the forced
// post-login gate (AuthService/AuthController) and anywhere else that needs
// to know whether a user still owes us this info.
export function isProfileComplete(user: {
  inGameName?: string | null;
  inGameUid?: string | null;
}): boolean {
  // Phone is optional: it can be added and verified later from the profile.
  return !!(user.inGameName && user.inGameUid);
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

    if (existing?.avatarFileKey && existing.avatarFileKey !== stored.fileKey) {
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
      // Phone is only ever set by Telegram verification (see PhoneVerifyService).
      // Re-sending the number already on file is a harmless no-op; anything
      // else must go through the verify flow.
      const requested = normalizePhone(data.phone);
      if (requested) {
        const current = await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { phone: true },
        });
        if (requested !== current.phone) {
          throw new BadRequestException(
            'Verify your phone number with Telegram to set or change it.',
          );
        }
      }
      delete data.phone;
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

      // Keep the FREE_FIRE game-profile row aligned with the legacy columns
      // that chat / stats / the completion gate still read.
      if (
        data.roles !== undefined ||
        data.inGameName !== undefined ||
        data.inGameUid !== undefined
      ) {
        await this.mirrorFreeFireGameProfile(userId, {
          inGameName: updated.inGameName,
          inGameUid: updated.inGameUid,
          role: updated.roles[0] ?? null,
        });
      }

      const refreshed = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: PROFILE_SELECT,
      });
      return {
        ...refreshed,
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

  /**
   * Upsert one title's IGN / UID / role. FREE_FIRE also writes the legacy
   * User columns so existing chat/stats/completion code keeps working.
   * Clearing every field deletes that game's row (optional titles only —
   * Free Fire still needs IGN+UID for a complete profile).
   */
  async upsertGameProfile(userId: string, dto: UpsertGameProfileDto) {
    if (!isGameId(dto.game)) {
      throw new BadRequestException('Unsupported game');
    }
    const game = dto.game as GameId;
    const inGameName =
      typeof dto.inGameName === 'string' ? dto.inGameName.trim() || null : null;
    const inGameUid =
      typeof dto.inGameUid === 'string' ? dto.inGameUid.trim() || null : null;
    const role =
      typeof dto.role === 'string' ? dto.role.trim() || null : null;

    if (!isRoleForGame(game, role)) {
      throw new BadRequestException(`Invalid role for ${game}`);
    }
    if (inGameUid && !uidLooksValid(game, inGameUid)) {
      throw new BadRequestException(
        game === 'LOL'
          ? 'Riot ID is too long'
          : 'UID must contain only numbers',
      );
    }

    const empty = !inGameName && !inGameUid && !role;
    if (empty) {
      if (game === 'FREE_FIRE') {
        throw new BadRequestException(
          'Free Fire needs at least an in-game name or UID',
        );
      }
      await this.prisma.userGameProfile.deleteMany({
        where: { userId, game },
      });
      return this.getMyProfile(userId);
    }

    if (game === 'FREE_FIRE') {
      // Write the legacy User columns chat / stats / completion still read,
      // then mirror into UserGameProfile.
      await this.assertUniqueProfileFields(userId, {
        inGameName: inGameName ?? undefined,
        inGameUid: inGameUid ?? undefined,
      });
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            inGameName,
            inGameUid,
            roles: role ? [role] : [],
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException(this.uniqueConflictMessage(err));
        }
        throw err;
      }
      await this.mirrorFreeFireGameProfile(userId, {
        inGameName,
        inGameUid,
        role,
      });
      return this.getMyProfile(userId);
    }

    await this.assertGameProfileUnique(userId, game, inGameName, inGameUid);

    try {
      await this.prisma.userGameProfile.upsert({
        where: { userId_game: { userId, game } },
        create: { userId, game, inGameName, inGameUid, role },
        update: { inGameName, inGameUid, role },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('That in-game name or UID is already in use');
      }
      throw err;
    }

    return this.getMyProfile(userId);
  }

  async removeGameProfile(userId: string, gameRaw: string) {
    if (!isGameId(gameRaw)) {
      throw new BadRequestException('Unsupported game');
    }
    if (gameRaw === 'FREE_FIRE') {
      throw new BadRequestException(
        'Free Fire is your primary game identity — clear it from the Game tab instead of deleting it',
      );
    }
    await this.prisma.userGameProfile.deleteMany({
      where: { userId, game: gameRaw },
    });
    return this.getMyProfile(userId);
  }

  /**
   * Toggle whether teammates see this game's IGN and/or UID. Creates a
   * game-profile row if needed so the preference sticks even before the
   * owner fills in IGN/UID (except Free Fire, which copies from User).
   */
  async setGameProfileVisibility(
    userId: string,
    dto: GameProfileVisibilityDto,
  ) {
    if (!isGameId(dto.game)) {
      throw new BadRequestException('Unsupported game');
    }
    if (
      dto.showNameToMembers === undefined &&
      dto.showUidToMembers === undefined
    ) {
      throw new BadRequestException('Nothing to update');
    }

    const game = dto.game as GameId;
    const existing = await this.prisma.userGameProfile.findUnique({
      where: { userId_game: { userId, game } },
    });

    let seedName: string | null = existing?.inGameName ?? null;
    let seedUid: string | null = existing?.inGameUid ?? null;
    let seedRole: string | null = existing?.role ?? null;
    if (!existing && game === 'FREE_FIRE') {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { inGameName: true, inGameUid: true, roles: true },
      });
      seedName = user.inGameName;
      seedUid = user.inGameUid;
      seedRole = user.roles[0] ?? null;
    }

    await this.prisma.userGameProfile.upsert({
      where: { userId_game: { userId, game } },
      create: {
        userId,
        game,
        inGameName: seedName,
        inGameUid: seedUid,
        role: seedRole,
        showNameToMembers: dto.showNameToMembers ?? true,
        showUidToMembers: dto.showUidToMembers ?? true,
      },
      update: {
        ...(dto.showNameToMembers !== undefined
          ? { showNameToMembers: dto.showNameToMembers }
          : {}),
        ...(dto.showUidToMembers !== undefined
          ? { showUidToMembers: dto.showUidToMembers }
          : {}),
      },
    });

    return this.getMyProfile(userId);
  }

  private async mirrorFreeFireGameProfile(
    userId: string,
    data: {
      inGameName: string | null;
      inGameUid: string | null;
      role: string | null;
    },
  ) {
    if (!data.inGameName && !data.inGameUid && !data.role) {
      // Keep a row if the owner already flipped privacy off — otherwise the
      // hide preference would be lost the next time they clear IGN/UID.
      const existing = await this.prisma.userGameProfile.findUnique({
        where: { userId_game: { userId, game: 'FREE_FIRE' } },
        select: { showNameToMembers: true, showUidToMembers: true },
      });
      if (
        existing &&
        (existing.showNameToMembers === false ||
          existing.showUidToMembers === false)
      ) {
        await this.prisma.userGameProfile.update({
          where: { userId_game: { userId, game: 'FREE_FIRE' } },
          data: { inGameName: null, inGameUid: null, role: null },
        });
        return;
      }
      await this.prisma.userGameProfile.deleteMany({
        where: { userId, game: 'FREE_FIRE' },
      });
      return;
    }
    await this.prisma.userGameProfile.upsert({
      where: { userId_game: { userId, game: 'FREE_FIRE' } },
      create: {
        userId,
        game: 'FREE_FIRE',
        inGameName: data.inGameName,
        inGameUid: data.inGameUid,
        role: data.role,
      },
      update: {
        inGameName: data.inGameName,
        inGameUid: data.inGameUid,
        role: data.role,
      },
    });
  }

  /**
   * Soft-pause the account. Sessions die via tokenVersion bump; the next
   * successful login clears deactivatedAt (reactivate).
   */
  async deactivateMyAccount(userId: string, dto: ConfirmAccountActionDto) {
    const user = await this.requireAccountConfirmation(userId, dto);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        deactivatedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
    return { ok: true as const };
  }

  /**
   * Permanent delete. Owners must transfer/delete their team first — wiping
   * an org out from under teammates is not recoverable from the app.
   */
  async deleteMyAccount(userId: string, dto: ConfirmAccountActionDto) {
    const user = await this.requireAccountConfirmation(userId, dto);
    const owned = await this.prisma.membership.findFirst({
      where: { userId: user.id, isOwner: true },
      select: { orgId: true },
    });
    if (owned) {
      throw new BadRequestException(
        'You own a team — transfer ownership or delete the team before deleting your account',
      );
    }
    await this.prisma.user.delete({ where: { id: user.id } });
    return { ok: true as const };
  }

  private async requireAccountConfirmation(
    userId: string,
    dto: ConfirmAccountActionDto,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });
    if (dto.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException(
        'Type your account email exactly to confirm',
      );
    }
    if (user.passwordHash) {
      if (!dto.password) {
        throw new BadRequestException('Password is required');
      }
      const ok = await bcrypt.compare(dto.password, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedException('Incorrect password');
      }
    }
    return user;
  }

  /** Apply showName/showUid flags for teammate views; strip the flags themselves. */
  private redactGameProfilesForPeer(
    gameProfiles: Array<{
      game: string;
      inGameName: string | null;
      inGameUid: string | null;
      role: string | null;
      showNameToMembers: boolean;
      showUidToMembers: boolean;
    }>,
  ) {
    return gameProfiles
      .map((row) => {
        const inGameName = row.showNameToMembers ? row.inGameName : null;
        const inGameUid = row.showUidToMembers ? row.inGameUid : null;
        const role =
          row.showNameToMembers || row.showUidToMembers ? row.role : null;
        return {
          game: row.game,
          inGameName,
          inGameUid,
          role,
        };
      })
      .filter((row) => row.inGameName || row.inGameUid || row.role);
  }

  private async assertGameProfileUnique(
    userId: string,
    game: GameId,
    inGameName: string | null,
    inGameUid: string | null,
  ) {
    if (inGameName) {
      const taken = await this.prisma.userGameProfile.findFirst({
        where: {
          game,
          userId: { not: userId },
          inGameName: { equals: inGameName, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('That in-game name is already in use');
      }
    }
    if (inGameUid) {
      const taken = await this.prisma.userGameProfile.findFirst({
        where: {
          game,
          userId: { not: userId },
          inGameUid: { equals: inGameUid, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('That UID is already in use');
      }
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
    const fields = Array.isArray(target)
      ? target.join(',')
      : String(target ?? '');
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
    // Expo tokens are per install/device. If another account still has this
    // token (e.g. logout never cleared it), strip it so the previous user
    // stops pushing to this phone after an account switch.
    await this.claimPushToken(userId, dto.token);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });
    // Keep tokens from other devices so an old phone still gets pushes after
    // a new phone logs in (capped list — see mergePushToken).
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: mergePushToken(user?.expoPushToken, dto.token) },
    });
  }

  /**
   * Drop this device's Expo token from the signed-in user. Called on logout
   * so the next account on the same phone is not haunted by leftover pushes.
   */
  async clearPushToken(userId: string, dto: SetPushTokenDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });
    if (!user?.expoPushToken) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: removePushToken(user.expoPushToken, dto.token) },
    });
  }

  /** Remove `token` from every user except `keepUserId`. */
  private async claimPushToken(keepUserId: string, token: string) {
    const others = await this.prisma.user.findMany({
      where: {
        id: { not: keepUserId },
        expoPushToken: { contains: token },
      },
      select: { id: true, expoPushToken: true },
    });
    for (const u of others) {
      await this.prisma.user.update({
        where: { id: u.id },
        data: { expoPushToken: removePushToken(u.expoPushToken, token) },
      });
    }
  }

  async getMemberProfile(requesterId: string, targetUserId: string) {
    if (requesterId === targetUserId) {
      return this.getMyProfile(requesterId);
    }

    const [requesterMembership, targetMembership, requesterGuild, targetGuild] =
      await Promise.all([
        this.prisma.membership.findFirst({ where: { userId: requesterId } }),
        this.prisma.membership.findFirst({ where: { userId: targetUserId } }),
        this.prisma.guildMembership.findFirst({
          where: { userId: requesterId },
        }),
        this.prisma.guildMembership.findFirst({
          where: { userId: targetUserId },
        }),
      ]);

    // Same org via either seat counts. A roster player may not have a
    // guildMembership row yet, and a guild-only joiner has no roster seat —
    // both still belong to the same org and can see each other.
    const requesterOrgId =
      requesterMembership?.orgId ?? requesterGuild?.orgId ?? null;
    const targetOrgId = targetMembership?.orgId ?? targetGuild?.orgId ?? null;
    if (!requesterOrgId || !targetOrgId || requesterOrgId !== targetOrgId) {
      throw new ForbiddenException(
        'You can only view profiles of members in your own org',
      );
    }

    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: PEER_PROFILE_SELECT,
    });

    const {
      showPhoneToMembers,
      showWhatsappToMembers,
      showInstagramToMembers,
      showDiscordToMembers,
      showYoutubeToMembers,
      showKickToMembers,
      phone,
      phoneVerifiedAt,
      whatsappUrl,
      instagramUrl,
      discordUrl,
      youtubeUrl,
      kickUrl,
      gameProfiles,
      inGameName,
      inGameUid,
      roles,
      ...publicFields
    } = profile;

    const visibleGames = this.redactGameProfilesForPeer(gameProfiles);
    const freeFire = gameProfiles.find((g) => g.game === 'FREE_FIRE');
    const showFfName = freeFire?.showNameToMembers !== false;
    const showFfUid = freeFire?.showUidToMembers !== false;

    return {
      ...publicFields,
      // Strip the preference flags themselves — peers only need the filtered
      // values, not a map of what the owner chose to hide.
      phone: showPhoneToMembers ? phone : null,
      phoneVerifiedAt: showPhoneToMembers ? phoneVerifiedAt : null,
      whatsappUrl: showWhatsappToMembers ? whatsappUrl : null,
      instagramUrl: showInstagramToMembers ? instagramUrl : null,
      discordUrl: showDiscordToMembers ? discordUrl : null,
      youtubeUrl: showYoutubeToMembers ? youtubeUrl : null,
      kickUrl: showKickToMembers ? kickUrl : null,
      // Legacy Free Fire columns stay in sync with the FREE_FIRE visibility
      // flags so older clients that only read inGameName/Uid still respect hide.
      inGameName: showFfName ? inGameName : null,
      inGameUid: showFfUid ? inGameUid : null,
      roles: showFfName || showFfUid ? roles : [],
      gameProfiles: visibleGames,
      role: targetMembership?.role ?? null,
      isOwner: targetMembership?.isOwner ?? false,
    };
  }
}
