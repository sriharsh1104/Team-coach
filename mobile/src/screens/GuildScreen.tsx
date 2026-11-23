import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { AppIcon } from '../ui/AppIcon';
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
import { IconActionButton } from '../ui/IconActionButton';
import { ListSearchField } from '../ui/ListSearchField';
import {
  matchesPersonQuery,
  usePagedSearch,
} from '../ui/usePagedSearch';
import { GuildJoinRequestsPanel } from './GuildJoinRequestsPanel';
import { emitToast } from '../ui/toastBus';
import { confirmAsync } from '../ui/confirmAsync';
import { ChannelAvatar } from './chat/ChannelAvatar';

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

type GuildTab = 'members' | 'roster' | 'requests';
const BASE_GUILD_TABS = [
  { value: 'members' as const, label: 'Members' },
  { value: 'roster' as const, label: 'Roster' },
];

/**
 * Guild home — single FlatList so invite + roster/members all scroll together
 * (BookStage page-turn was remounting lists and killing scroll height).
 */
export function GuildScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const { user, org, refreshOrg } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(guildStyles);
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [guildTab, setGuildTab] = useState<GuildTab>('members');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const realtime = useOrgRealtimeOptional();
  const isOrgOwner = !!org?.isOwner;

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
    const confirmed = await confirmAsync(
      'Add To Roster',
      `Add ${personLabel(member.name, member.inGameName)} to the esports roster?`,
      'Yes',
      'No',
      false,
    );
    if (!confirmed) return;
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
      'Yes',
      'No',
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

  const onLeaveGuild = async () => {
    if (isOrgOwner) {
      emitToast('Transfer ownership before leaving — you own this org’s roster');
      return;
    }
    const confirmed = await confirmAsync(
      'Leave Guild',
      'Leave this guild? You will also leave the esports roster for this org.',
      'Leave',
      'Cancel',
    );
    if (!confirmed) return;
    setLeaving(true);
    try {
      await orgApi.leaveGuild();
      emitToast('You left the guild');
      await refreshOrg();
    } catch (err: unknown) {
      emitToast(errorMessage(err, 'Could not leave the guild'));
    } finally {
      setLeaving(false);
    }
  };

  const members = detail?.members ?? [];
  const roster = detail?.roster ?? [];
  const canManage = !!detail?.canManageRoster;
  // Same people who can decide browse-join requests (owner / coach / leaders).
  const canReviewRequests =
    isOrgOwner ||
    org?.role === 'COACH' ||
    detail?.myGuildRole === 'LEADER' ||
    detail?.myGuildRole === 'ACTIVE_LEADER';
  const guildTabs = canReviewRequests
    ? [
        ...BASE_GUILD_TABS,
        { value: 'requests' as const, label: 'Requests' },
      ]
    : BASE_GUILD_TABS;
  const showPeopleList = guildTab === 'members' || guildTab === 'roster';
  // Waiting guild members first so Add-to-roster is obvious for owners/coaches.
  const sortedMembers = canManage
    ? [...members].sort((a, b) => Number(a.onRoster) - Number(b.onRoster))
    : members;
  const listSource: Array<GuildMemberRow | GuildRosterMember> =
    guildTab === 'members'
      ? sortedMembers
      : guildTab === 'roster'
        ? roster
        : [];
  const matchGuildPerson = useCallback(
    (item: GuildMemberRow | GuildRosterMember, q: string) =>
      matchesPersonQuery(q, {
        name: item.name,
        email: item.email,
        inGameName: item.inGameName,
      }),
    [],
  );
  const {
    draft: listDraft,
    setDraft: setListDraft,
    query: listQuery,
    visible: listData,
    hasMore: listHasMore,
    loadMore: loadMoreList,
    total: listTotal,
    clear: clearListSearch,
  } = usePagedSearch({ items: listSource, match: matchGuildPerson });
  const waitingCount = members.filter((m) => !m.onRoster).length;

  // If leadership access goes away, leave the Requests tab.
  useEffect(() => {
    if (!canReviewRequests && guildTab === 'requests') {
      setGuildTab('members');
    }
  }, [canReviewRequests, guildTab]);

  useEffect(() => {
    clearListSearch();
  }, [guildTab, clearListSearch]);

  return (
    <Screen>
      <FlatList<GuildMemberRow | GuildRosterMember>
        style={staticStyles.list}
        data={showPeopleList ? listData : []}
        keyExtractor={(item) => item.userId}
        onEndReached={() => {
          if (listHasMore) loadMoreList();
        }}
        onEndReachedThreshold={0.4}
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
                {detail.freeFireGuildId ? (
                  <View style={styles.inviteRow}>
                    <View style={staticStyles.inviteTextCol}>
                      <Text style={styles.inviteLabel}>
                        Free Fire Guild ID
                      </Text>
                      <Text style={styles.inviteValue}>
                        {detail.freeFireGuildId}
                      </Text>
                    </View>
                    <CopyButton value={detail.freeFireGuildId} />
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
              tabs={guildTabs}
              value={guildTab}
              onChange={(next) => setGuildTab(next)}
            />
            {/* Keep mounted so switching to Requests doesn't remount/reload
                the whole inbox the way Members ↔ Roster just swaps rows. */}
            {canReviewRequests ? (
              <View
                style={
                  guildTab === 'requests'
                    ? undefined
                    : staticStyles.hiddenPanel
                }
                pointerEvents={guildTab === 'requests' ? 'auto' : 'none'}
                accessibilityElementsHidden={guildTab !== 'requests'}
                importantForAccessibility={
                  guildTab === 'requests' ? 'yes' : 'no-hide-descendants'
                }
              >
                <GuildJoinRequestsPanel onAccepted={() => void load()} />
              </View>
            ) : null}
            {showPeopleList ? (
              <ListSearchField
                value={listDraft}
                onChangeText={setListDraft}
                placeholder="Search by name or email"
                accessibilityLabel="Search guild members"
              />
            ) : null}
            {canManage && guildTab === 'members' ? (
              <Text style={styles.manageHint}>
                {waitingCount > 0
                  ? `${waitingCount} waiting — tap + to add to roster, − to remove.`
                  : 'Everyone below is on the esports roster. Tap − to remove someone.'}
              </Text>
            ) : null}
            {detail && !canManage && showPeopleList ? (
              <Text style={styles.manageHint}>
                Only the org owner can add or remove roster seats.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (!showPeopleList) return null;
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
          detail && showPeopleList ? (
            <Text style={styles.empty}>
              {listQuery
                ? 'No matches.'
                : guildTab === 'members'
                  ? 'No guild members yet.'
                  : 'No one is on the roster yet.'}
            </Text>
          ) : null
        }
        ListFooterComponent={
          detail ? (
            <View style={staticStyles.leaveBlock}>
              {listHasMore && showPeopleList ? (
                <SoftPressable
                  style={{ paddingVertical: 10, alignItems: 'center' }}
                  onPress={loadMoreList}
                  pressScale={0.98}
                  accessibilityRole="button"
                  accessibilityLabel="Load more"
                >
                  <Text style={{ color: colors.link, fontWeight: '700' }}>
                    Load more · {listData.length} of {listTotal}
                  </Text>
                </SoftPressable>
              ) : null}
              {isOrgOwner ? (
                <Text style={styles.manageHint}>
                  You own this org’s roster — transfer ownership in Roster /
                  Members settings before you can leave.
                </Text>
              ) : (
                // Icon, not a full-width red bar: leaving is a rare action
                // and the slab read like the screen's primary button.
                <View style={staticStyles.leaveRow}>
                  <IconActionButton
                    icon="log-out"
                    label="Leave Guild"
                    danger
                    loading={leaving}
                    disabled={leaving}
                    onPress={() => void onLeaveGuild()}
                  />
                </View>
              )}
            </View>
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
            staticStyles.addChip,
            styles.addChip,
            busy && staticStyles.iconBtnDisabled,
          ]}
          disabled={busy}
          onPress={onAdd}
          pressScale={0.96}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          accessibilityLabel={`Add ${name} to roster`}
        >
          <AppIcon name="person-add" size={16} color={colors.link} />
          <Text style={styles.addChipText}>Add</Text>
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
          <AppIcon name="person-remove" size={22} color={colors.text} />
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
        <ChannelAvatar
          uri={member.avatarUrl}
          size={32}
          fallback={(member.name[0] ?? '?').toUpperCase()}
          previewable={false}
        />
        <SoftPressable
          style={staticStyles.rosterTextCol}
          onPress={onPress}
          pressScale={0.99}
          accessibilityRole="button"
        >
          <Text style={styles.rowName} numberOfLines={1}>
            {personLabel(member.name, member.inGameName)}
            {member.isOwner ? ' (Owner)' : ''}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
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
          <Text style={styles.rowName} numberOfLines={1}>
            {personLabel(member.name, member.inGameName)}
            {member.isOwner ? ' (Owner)' : ''}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
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
  hiddenPanel: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  leaveBlock: { marginTop: 20, marginBottom: 12, gap: 8 },
  leaveRow: { alignItems: 'center' },
  inviteCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  inviteTextCol: { flex: 1 },
  /** Flat list rows — no per-user cards. */
  row: {
    paddingVertical: 8,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
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
    rowName: { fontSize: 14, color: c.text, fontWeight: '600' as const },
    rowMeta: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    addChip: {
      backgroundColor: c.surface,
      borderColor: c.border,
    },
    addChipText: {
      color: c.link,
      fontSize: 13,
      fontWeight: '700' as const,
    },
    iconBtnRemove: {
      backgroundColor: c.danger,
    },
    empty: { color: c.textMuted, textAlign: 'center' as const, marginTop: 16 },
  };
}
