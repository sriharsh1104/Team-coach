import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, RefreshControl, StyleSheet } from 'react-native';
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
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { sharedStyles } from './shared';
import { CopyButton } from './profile/CopyButton';
import { RoleSelector } from './RoleSelector';
import { SegmentedTabs } from '../ui/SegmentedTabs';
import { SoftPressable } from '../ui/SoftPressable';
import { Toast, useToast } from '../ui/Toast';
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
 * Everyone who joined the org's invite code or link lands in the guild —
 * joining the guild does not put a player on the 5-seat esports roster.
 * An owner/coach promotes guild members onto the roster from here, or
 * removes a roster seat without kicking the person out of the guild
 * entirely. Mirrors web's GuildSpacePage (web/src/pages/guild).
 */
export function GuildScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<GuildDetail | null>(null);
  const [tab, setTab] = useState<GuildTab>('members');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { message: toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    const data = await orgApi.getMyGuild();
    setDetail(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const onAdd = async (member: GuildMemberRow, role: MembershipRole) => {
    setBusyId(member.userId);
    try {
      await orgApi.addGuildMemberToRoster(member.userId, role);
      showToast(`${personLabel(member.name, member.inGameName)} added to roster`);
      await load();
    } catch (err: unknown) {
      showToast(errorMessage(err, 'Could not add them to the roster'));
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
      showToast(`${label} removed from roster`);
      await load();
    } catch (err: unknown) {
      showToast(errorMessage(err, 'Could not remove them from the roster'));
    } finally {
      setBusyId(null);
    }
  };

  const members = detail?.members ?? [];
  const roster = detail?.roster ?? [];
  const canManage = !!detail?.canManageRoster;

  return (
    <Screen>
      <FlatList<GuildMemberRow | GuildRosterMember>
        style={styles.list}
        data={tab === 'members' ? members : roster}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.chrome}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <Text style={sharedStyles.title}>{detail?.name ?? 'Guild'}</Text>
            {detail ? (
              <Text style={styles.summary}>
                {GUILD_ROLE_LABEL[detail.myGuildRole]} · {members.length} member
                {members.length === 1 ? '' : 's'} · {roster.length} on roster
              </Text>
            ) : null}
            {detail?.referralLink ? (
              <View style={styles.inviteCard}>
                <Text style={styles.inviteTitle}>Invite & Referral</Text>
                <Text style={styles.inviteHint}>
                  Share your link (or guild code). People join the guild only.
                  Owner/coach can add them to the esports roster below, or share
                  a roster invite from Roster.
                </Text>
                <Text style={styles.inviteCount}>
                  Your invites: {detail.myInviteCount} guild member
                  {detail.myInviteCount === 1 ? '' : 's'}
                </Text>
                {detail.orgCode ? (
                  <View style={styles.inviteRow}>
                    <View style={styles.inviteTextCol}>
                      <Text style={styles.inviteLabel}>Guild Code</Text>
                      <Text style={styles.inviteValue}>{detail.orgCode}</Text>
                    </View>
                    <CopyButton value={detail.orgCode} />
                  </View>
                ) : null}
                <View style={styles.inviteRow}>
                  <View style={styles.inviteTextCol}>
                    <Text style={styles.inviteLabel}>Invite Link</Text>
                    <Text style={styles.inviteValue} numberOfLines={1}>
                      {detail.referralLink}
                    </Text>
                  </View>
                  <CopyButton value={detail.referralLink} />
                </View>
              </View>
            ) : null}
            <SegmentedTabs tabs={GUILD_TABS} value={tab} onChange={setTab} />
          </>
        }
        renderItem={({ item }) =>
          'guildRole' in item ? (
            <MemberRow
              member={item}
              canManage={canManage}
              busy={busyId === item.userId}
              onAdd={(role) => onAdd(item, role)}
              onPress={() =>
                navigation.push('MemberProfile', {
                  userId: item.userId,
                  name: item.name,
                })
              }
            />
          ) : (
            <RosterRow
              member={item}
              canManage={canManage}
              selfId={user?.id}
              busy={busyId === item.userId}
              onRemove={() => onRemove(item)}
              onPress={() =>
                navigation.push('MemberProfile', {
                  userId: item.userId,
                  name: item.name,
                })
              }
            />
          )
        }
        ListEmptyComponent={
          detail ? (
            <Text style={styles.empty}>
              {tab === 'members' ? 'No guild members yet.' : 'No one is on the roster yet.'}
            </Text>
          ) : null
        }
      />
      <Toast message={toastMessage} />
    </Screen>
  );
}

function MemberRow({
  member,
  canManage,
  busy,
  onAdd,
  onPress,
}: {
  member: GuildMemberRow;
  canManage: boolean;
  busy: boolean;
  onAdd: (role: MembershipRole) => void;
  onPress: () => void;
}) {
  const [role, setRole] = useState<MembershipRole>('PLAYER');
  return (
    <SoftPressable style={styles.row} onPress={onPress} pressScale={0.985}>
      <Text style={styles.rowName}>
        {personLabel(member.name, member.inGameName)}
        {member.isOwner ? ' (Owner)' : ''}
      </Text>
      <Text style={styles.rowMeta}>
        {GUILD_ROLE_LABEL[member.guildRole]}
        {member.onRoster
          ? ` · Roster ${member.rosterRole ? ROSTER_ROLE_LABEL[member.rosterRole] : ''}`
          : ' · Not on roster'}
      </Text>
      {canManage && !member.onRoster ? (
        <View style={styles.addRow}>
          <RoleSelector value={role} onChange={setRole} />
          <SoftPressable
            style={[styles.addBtn, busy && styles.addBtnDisabled]}
            disabled={busy}
            onPress={() => onAdd(role)}
            pressScale={0.96}
          >
            <Text style={styles.addBtnText}>Add to roster</Text>
          </SoftPressable>
        </View>
      ) : null}
    </SoftPressable>
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
  const canRemove = canManage && !member.isOwner && member.userId !== selfId;
  return (
    <SoftPressable style={styles.row} onPress={onPress} pressScale={0.985}>
      <View style={styles.rosterMain}>
        <View style={styles.rosterTextCol}>
          <Text style={styles.rowName}>
            {personLabel(member.name, member.inGameName)}
            {member.isOwner ? ' (Owner)' : ''}
          </Text>
          <Text style={styles.rowMeta}>
            {member.role ? ROSTER_ROLE_LABEL[member.role] : 'Owner'}
          </Text>
        </View>
        {canRemove ? (
          <SoftPressable
            onPress={onRemove}
            disabled={busy}
            pressScale={0.96}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${member.name} from roster`}
          >
            <Text style={styles.removeLink}>Remove</Text>
          </SoftPressable>
        ) : null}
      </View>
    </SoftPressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: { padding: 24 },
  summary: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: -12,
    marginBottom: 20,
  },
  inviteCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  inviteTitle: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  inviteHint: { color: colors.textMuted, fontSize: 12, marginBottom: 8, lineHeight: 16 },
  inviteCount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inviteTextCol: { flex: 1 },
  inviteLabel: { color: colors.textMuted, fontSize: 12 },
  inviteValue: { color: colors.text, fontWeight: '600', marginTop: 2 },
  row: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rowName: { fontSize: 16, color: colors.text, fontWeight: '700' },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  addRow: { marginTop: 6 },
  addBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.chrome,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: colors.chromeInk, fontWeight: '700', fontSize: 13 },
  rosterMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rosterTextCol: { flex: 1 },
  removeLink: { color: colors.danger, fontWeight: '600' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 8 },
});
