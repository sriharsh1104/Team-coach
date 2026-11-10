import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import {
  GuildDetail,
  GuildMemberRow,
  GuildRole,
  GuildRosterMember,
  MembershipRole,
} from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { useOrgRealtimeOptional } from '../realtime/OrgRealtimeProvider';
import { Screen } from '../brand/Screen';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useSharedStyles } from './shared';
import { CopyButton } from './profile/CopyButton';
import { InviteQr } from '../ui/InviteQr';
import { MarqueeText } from '../ui/MarqueeText';
import { SegmentedTabs } from '../ui/SegmentedTabs';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';
import { confirmAsync } from '../ui/confirmAsync';

type Props = NativeStackScreenProps<MainStackParamList, 'Guild'>;

const GUILD_ROLE_LABEL: Record<GuildRole, string> = {
  MEMBER: 'Member',
  ELDER: 'Elder',
  ACTIVE_LEADER: 'Active Leader',
  LEADER: 'Leader',
};

const ROSTER_ROLE_LABEL: Record<MembershipRole, string> = {
  PLAYER: 'Player',
  COACH: 'Coach',
  ANALYST: 'Analyst',
};

function personLabel(name: string, inGameName: string | null) {
  return inGameName ? `${inGameName} · ${name}` : name;
}

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

type GuildTab = 'members' | 'roster';
const GUILD_TABS = [
  { value: 'members' as const, label: 'Members' },
  { value: 'roster' as const, label: 'Roster' },
];

/**
 * Guild home — single FlatList so invite + roster/members all scroll together
 * (BookStage page-turn was remounting lists and killing scroll height).
 */
export function GuildScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(guildStyles);
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [guildTab, setGuildTab] = useState<GuildTab>('members');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const realtime = useOrgRealtimeOptional();

  const load = useCallback(async () => {
    const data = await orgApi.getMyGuild();
    setDetail(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      void load();
    });
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event) => {
      if (event.type === 'members.changed') void load();
    });
  }, [realtime, load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const onAdd = async (member: GuildMemberRow, role: MembershipRole) => {
    setBusyId(member.userId);
    try {
      await orgApi.addGuildMemberToRoster(member.userId, role);
      emitToast(
        `${personLabel(member.name, member.inGameName)} added to roster`,
      );
      await load();
    } catch (err: unknown) {
      emitToast(errorMessage(err, 'Could not add them to the roster'));
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (member: GuildRosterMember) => {
    const label = personLabel(member.name, member.inGameName);
    const confirmed = await confirmAsync(
      'Remove From Roster',
      `Remove ${label} from the roster? They stay in the guild.`,
      'Remove',
    );
    if (!confirmed) return;
    setBusyId(member.userId);
    try {
      await orgApi.removeFromGuildRoster(member.userId);
      emitToast(`${label} removed from roster`);
      await load();
    } catch (err: unknown) {
      emitToast(errorMessage(err, 'Could not remove them from the roster'));
    } finally {
      setBusyId(null);
    }
  };

  const members = detail?.members ?? [];
  const roster = detail?.roster ?? [];
  const canManage = !!detail?.canManageRoster;
  // Waiting guild members first so Add-to-roster is obvious for owners/coaches.
  const sortedMembers = canManage
    ? [...members].sort((a, b) => Number(a.onRoster) - Number(b.onRoster))
    : members;
  const listData = guildTab === 'members' ? sortedMembers : roster;
  const waitingCount = members.filter((m) => !m.onRoster).length;

  return (
    <Screen>
      <FlatList<GuildMemberRow | GuildRosterMember>
        style={staticStyles.list}
        data={listData}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.chrome}
          />
        }
        contentContainerStyle={staticStyles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={shared.title}>{detail?.name ?? 'Guild'}</Text>
            {detail ? (
              <Text style={styles.summary}>
                {GUILD_ROLE_LABEL[detail.myGuildRole]} · {members.length} member
                {members.length === 1 ? '' : 's'} · {roster.length} on roster
              </Text>
            ) : null}
            {detail?.referralLink ? (
              <View style={staticStyles.inviteCard}>
                <Text style={styles.inviteTitle}>Invite & Referral</Text>
                <Text style={styles.inviteHint}>
                  Share your link (or guild code). People join the guild only.
                  Owner/coach can add them to the esports roster below, or share
                  a roster invite from Esports Arena → Roster.
                </Text>
                <Text style={styles.inviteCount}>
                  Your invites: {detail.myInviteCount} guild member
                  {detail.myInviteCount === 1 ? '' : 's'}
                </Text>
                <InviteQr value={detail.referralLink} label="Scan to join guild" />
                {detail.orgCode ? (
                  <View style={styles.inviteRow}>
                    <View style={staticStyles.inviteTextCol}>
                      <Text style={styles.inviteLabel}>Guild Code</Text>
                      <Text style={styles.inviteValue}>{detail.orgCode}</Text>
                    </View>
                    <CopyButton value={detail.orgCode} />
                  </View>
                ) : null}
                <View style={styles.inviteRow}>
                  <View style={staticStyles.inviteTextCol}>
                    <Text style={styles.inviteLabel}>Invite Link</Text>
                    <MarqueeText
                      autoPlay
                      lineHeight={20}
                      style={styles.inviteValue}
                    >
                      {detail.referralLink}
                    </MarqueeText>
                  </View>
                  <CopyButton value={detail.referralLink} />
                </View>
              </View>
            ) : null}
            <SegmentedTabs
              tabs={GUILD_TABS}
              value={guildTab}
              onChange={(next) => setGuildTab(next)}
            />
            {canManage && guildTab === 'members' ? (
              <Text style={styles.manageHint}>
                {waitingCount > 0
                  ? `${waitingCount} waiting — tap + to add to roster, − to remove.`
                  : 'Everyone below is on the esports roster. Tap − to remove someone.'}
              </Text>
            ) : null}
            {detail && !canManage ? (
              <Text style={styles.manageHint}>
                Only the org owner or a coach can add or remove roster seats.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (guildTab === 'members') {
            const member = item as GuildMemberRow;
            return (
              <MemberRow
                member={member}
                canManage={canManage}
                selfId={user?.id}
                busy={busyId === member.userId}
                onAdd={(role) => onAdd(member, role)}
                onRemove={() =>
                  onRemove({
                    userId: member.userId,
                    name: member.name,
                    inGameName: member.inGameName,
                    role: member.rosterRole,
                    isOwner: member.isOwner,
                  })
                }
                onPress={() =>
                  navigation.push('MemberProfile', {
                    userId: member.userId,
                    name: member.name,
                  })
                }
              />
            );
          }
          const member = item as GuildRosterMember;
          return (
            <RosterRow
              member={member}
              canManage={canManage}
              selfId={user?.id}
              busy={busyId === member.userId}
              onRemove={() => onRemove(member)}
              onPress={() =>
                navigation.push('MemberProfile', {
                  userId: member.userId,
                  name: member.name,
                })
              }
            />
          );
        }}
        ListEmptyComponent={
          detail ? (
            <Text style={styles.empty}>
              {guildTab === 'members'
                ? 'No guild members yet.'
                : 'No one is on the roster yet.'}
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

function RosterActionIcons({
  canAdd,
  canRemove,
  busy,
  onAdd,
  onRemove,
  name,
}: {
  canAdd: boolean;
  canRemove: boolean;
  busy: boolean;
  onAdd: () => void;
  onRemove: () => void;
  name: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(guildStyles);

  // Only render actions that apply — a permanently-disabled twin (e.g. "+"
  // on the Roster tab) used to sit next to the real control at 0.35 opacity
  // and looked like both icons were "missing" to the naked eye.
  if (!canAdd && !canRemove) return null;

  return (
    <View style={staticStyles.iconActions}>
      {canAdd ? (
        <SoftPressable
          style={[
            staticStyles.iconBtn,
            styles.iconBtnAdd,
            busy && staticStyles.iconBtnDisabled,
          ]}
          disabled={busy}
          onPress={onAdd}
          pressScale={0.92}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          accessibilityLabel={`Add ${name} to roster`}
        >
          <Ionicons name="person-add" size={22} color={colors.chromeInk} />
        </SoftPressable>
      ) : null}
      {canRemove ? (
        <SoftPressable
          style={[
            staticStyles.iconBtn,
            styles.iconBtnRemove,
            busy && staticStyles.iconBtnDisabled,
          ]}
          disabled={busy}
          onPress={onRemove}
          pressScale={0.92}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          accessibilityLabel={`Remove ${name} from roster`}
        >
          <Ionicons name="person-remove" size={22} color={colors.text} />
        </SoftPressable>
      ) : null}
    </View>
  );
}

function MemberRow({
  member,
  canManage,
  selfId,
  busy,
  onAdd,
  onRemove,
  onPress,
}: {
  member: GuildMemberRow;
  canManage: boolean;
  selfId?: string;
  busy: boolean;
  onAdd: (role: MembershipRole) => void;
  onRemove: () => void;
  onPress: () => void;
}) {
  const styles = useThemedStyles(guildStyles);
  const canAdd = canManage && !member.onRoster;
  const canRemove =
    canManage && member.onRoster && !member.isOwner && member.userId !== selfId;
  return (
    <View style={staticStyles.row}>
      <View style={staticStyles.rosterMain}>
        <SoftPressable
          style={staticStyles.rosterTextCol}
          onPress={onPress}
          pressScale={0.99}
          accessibilityRole="button"
        >
          <Text style={styles.rowName} numberOfLines={2}>
            {personLabel(member.name, member.inGameName)}
            {member.isOwner ? ' (Owner)' : ''}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={2}>
            {GUILD_ROLE_LABEL[member.guildRole]}
            {member.onRoster
              ? ` · Roster ${member.rosterRole ? ROSTER_ROLE_LABEL[member.rosterRole] : ''}`
              : ' · Not on roster'}
          </Text>
        </SoftPressable>
        {canManage ? (
          <RosterActionIcons
            canAdd={canAdd}
            canRemove={canRemove}
            busy={busy}
            name={member.name}
            onAdd={() => onAdd('PLAYER')}
            onRemove={onRemove}
          />
        ) : null}
      </View>
    </View>
  );
}

function RosterRow({
  member,
  canManage,
  selfId,
  busy,
  onRemove,
  onPress,
}: {
  member: GuildRosterMember;
  canManage: boolean;
  selfId?: string;
  busy: boolean;
  onRemove: () => void;
  onPress: () => void;
}) {
  const styles = useThemedStyles(guildStyles);
  const canRemove = canManage && !member.isOwner && member.userId !== selfId;
  return (
    <View style={staticStyles.row}>
      <View style={staticStyles.rosterMain}>
        <SoftPressable
          style={staticStyles.rosterTextCol}
          onPress={onPress}
          pressScale={0.99}
          accessibilityRole="button"
        >
          <Text style={styles.rowName} numberOfLines={2}>
            {personLabel(member.name, member.inGameName)}
            {member.isOwner ? ' (Owner)' : ''}
          </Text>
          <Text style={styles.rowMeta}>
            {member.role ? ROSTER_ROLE_LABEL[member.role] : 'Owner'}
          </Text>
        </SoftPressable>
        {canManage ? (
          <RosterActionIcons
            canAdd={false}
            canRemove={canRemove}
            busy={busy}
            name={member.name}
            onAdd={() => {}}
            onRemove={onRemove}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  list: { flex: 1, minWidth: 0, backgroundColor: 'transparent' },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  inviteCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  inviteTextCol: { flex: 1 },
  row: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    maxWidth: '100%',
  },
  rosterMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    maxWidth: '100%',
  },
  rosterTextCol: { flex: 1, minWidth: 0 },
  iconActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.55 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function guildStyles(c: ThemeColors) {
  return {
    summary: {
      color: c.textMuted,
      fontSize: 13,
      textAlign: 'center' as const,
      marginTop: -12,
      marginBottom: 20,
    },
    manageHint: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 12,
      marginTop: -4,
    },
    inviteTitle: { color: c.text, fontWeight: '700' as const, fontSize: 16, marginBottom: 4 },
    inviteHint: { color: c.textMuted, fontSize: 12, marginBottom: 8, lineHeight: 16 },
    inviteCount: {
      color: c.text,
      fontSize: 13,
      fontWeight: '700' as const,
      marginBottom: 12,
    },
    inviteRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    inviteLabel: { color: c.textMuted, fontSize: 12 },
    inviteValue: { color: c.text, fontWeight: '600' as const, marginTop: 2 },
    rowName: { fontSize: 16, color: c.text, fontWeight: '700' as const },
    rowMeta: { fontSize: 12, color: c.textMuted },
    // Chrome / danger fills so the glyph reads clearly on the dark card —
    // the old translucent chip + dim glyph was nearly invisible.
    iconBtnAdd: {
      backgroundColor: c.chrome,
    },
    iconBtnRemove: {
      backgroundColor: c.danger,
    },
    empty: { color: c.textMuted, textAlign: 'center' as const, marginTop: 16 },
  };
}
