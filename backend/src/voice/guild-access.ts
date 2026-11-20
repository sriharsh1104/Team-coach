import { GuildRole, MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Guild voice is open to every guild member (roster or guild-only seat).
 * Owner, coach and guild leaders/elders are "hosts" (may mute / kick).
 * Shared by the self-hosted gateway and the hosted (LiveKit) service so both
 * transports apply exactly the same rules.
 */
export async function resolveGuildAccess(prisma: PrismaService, userId: string) {
  const [roster, guild] = await Promise.all([
    prisma.membership.findFirst({ where: { userId } }),
    prisma.guildMembership.findFirst({ where: { userId } }),
  ]);
  const orgId = roster?.orgId ?? guild?.orgId;
  if (!orgId) throw new Error('You are not part of a guild yet');
  const rosterHost =
    !!roster && (roster.isOwner || roster.role === MembershipRole.COACH);
  const guildHost =
    !!guild &&
    guild.orgId === orgId &&
    (guild.role === GuildRole.LEADER ||
      guild.role === GuildRole.ELDER ||
      guild.role === GuildRole.ACTIVE_LEADER);
  return { orgId, canModerate: rosterHost || guildHost };
}
