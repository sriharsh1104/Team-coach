import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Switch,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { GuildMemberRow, MembershipRole, OrgDetail, OrgMember } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { RoleSelector } from './RoleSelector';
import { Toast, useToast } from '../ui/Toast';
import { confirmAsync } from '../ui/confirmAsync';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgSettings'>;

function toOrgMember(member: GuildMemberRow): OrgMember {
  return {
    userId: member.userId,
    name: member.name,
    avatarUrl: null,
    role: member.rosterRole,
    isOwner: member.isOwner,
    inGameName: member.inGameName,
    inGameRoles: [],
  };
}

// Owner-only screen — guild members listed with a serial number, one roster
// role, and add / remove-from-roster. MembersScreen stays the roster viewer.
export function OrgSettingsScreen({ navigation }: Props) {
  const { refreshOrg, user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(orgSettingsStyles);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [guildMembers, setGuildMembers] = useState<GuildMemberRow[] | null>(null);
  const [draftRole, setDraftRole] = useState<Record<string, MembershipRole>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { message: toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    const [data, guild] = await Promise.all([
      orgApi.getMyOrg(),
      (async () => {
        try {
          return await orgApi.getMyGuild();
        } catch {
          return null;
        }
      })(),
    ]);
    setDetail(data);
    setGuildMembers(guild?.members ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (detail && !detail.isOwner) {
      // Reached directly (e.g. a stale deep link) by a non-owner — bounce out.
      navigation.goBack();
    }
  }, [detail, navigation]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const onChangeRole = async (member: OrgMember, role: MembershipRole) => {
    if (role === member.role) return;
    try {
      await orgApi.changeMemberRole(member.userId, role);
      showToast(`${member.name} is now ${role.charAt(0)}${role.slice(1).toLowerCase()}`);
      await refreshOrg();
      await load();
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    }
  };

  const onMakeOwner = async (member: OrgMember) => {
    const confirmed = await confirmAsync(
      'Transfer ownership?',
      `Do you want to transfer ownership to ${member.name}? You will no longer be the owner.`,
      'Yes',
      'No',
    );
    if (!confirmed) return;
    try {
      await orgApi.transferOwnership(member.userId);
      await refreshOrg();
      await load();
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    }
  };

  const onToggleHistory = async (value: boolean) => {
    setDetail((prev) => (prev ? { ...prev, historyVisibleToNewMembers: value } : prev));
    try {
      await orgApi.updateOrgSettings(value);
      showToast(
        value ? 'New members can now see full chat history' : 'New members only see chat from when they join',
      );
    } catch (err: any) {
      setDetail((prev) => (prev ? { ...prev, historyVisibleToNewMembers: !value } : prev));
      /* API error toasted by axios interceptor */
    }
  };

  const onAddToRoster = async (member: GuildMemberRow) => {
    const role = draftRole[member.userId] ?? 'PLAYER';
    try {
      await orgApi.addGuildMemberToRoster(member.userId, role);
      showToast(`${member.name} added to roster`);
      await refreshOrg();
      await load();
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    }
  };

  const onRemoveFromRoster = async (member: GuildMemberRow) => {
    const confirmed = await confirmAsync(
      'Remove from Roster',
      `Remove ${member.name} from the roster? They stay in the guild and can be added again.`,
      'Remove',
    );
    if (!confirmed) return;
    try {
      await orgApi.removeFromGuildRoster(member.userId);
      showToast(`${member.name} removed from roster`);
      await refreshOrg();
      await load();
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    }
  };

  const rows: GuildMemberRow[] =
    guildMembers ??
    (detail?.members ?? []).map((member) => ({
      userId: member.userId,
      name: member.name,
      inGameName: member.inGameName ?? null,
      guildRole: 'MEMBER' as const,
      onRoster: true,
      rosterRole: member.role,
      isOwner: member.isOwner,
    }));

  const orgById = new Map((detail?.members ?? []).map((member) => [member.userId, member]));

  return (
    <Screen>
      <FlatList
        style={staticStyles.list}
        data={rows}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.chrome}
          />
        }
        ListHeaderComponent={
          <>
            {detail && (
              <View style={staticStyles.settingRow}>
                <View style={staticStyles.settingTextCol}>
                  <Text style={styles.settingLabel}>Chat history for new members</Text>
                  <Text style={styles.settingHint}>
                    Let a new member see Team Chat messages from before they joined.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Chat history for new members"
                  value={detail.historyVisibleToNewMembers}
                  onValueChange={onToggleHistory}
                />
              </View>
            )}
            <Text style={styles.sectionHeader}>Members</Text>
          </>
        }
        contentContainerStyle={staticStyles.listContent}
        renderItem={({ item, index }) => {
          const orgMember = orgById.get(item.userId);
          const seatRole = orgMember?.role ?? item.rosterRole;
          const selectedRole = item.onRoster
            ? seatRole
            : (draftRole[item.userId] ?? 'PLAYER');
          const canRemove =
            item.onRoster && !item.isOwner && item.userId !== user?.id;
          return (
            <View style={staticStyles.memberCard}>
              <View style={staticStyles.nameRow}>
                <Text style={styles.serial}>{index + 1}</Text>
                <Text style={styles.memberName}>
                  {item.name}
                  {item.isOwner ? ' (Owner)' : ''}
                </Text>
              </View>
              <RoleSelector
                value={selectedRole}
                onChange={(role) => {
                  if (item.onRoster && orgMember) {
                    void onChangeRole(orgMember, role);
                    return;
                  }
                  setDraftRole((prev) => ({ ...prev, [item.userId]: role }));
                }}
              />
              <View style={staticStyles.actionsRow}>
                {!item.onRoster ? (
                  <Pressable
                    onPress={() => void onAddToRoster(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${item.name} to roster`}
                  >
                    <Text style={styles.actionLink}>Add to Roster</Text>
                  </Pressable>
                ) : null}
                {canRemove ? (
                  <Pressable
                    onPress={() => void onRemoveFromRoster(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name} from roster`}
                  >
                    <Text style={styles.removeLink}>Remove from Roster</Text>
                  </Pressable>
                ) : null}
                {item.onRoster && !item.isOwner ? (
                  <Pressable onPress={() => onMakeOwner(orgMember ?? toOrgMember(item))}>
                    <Text style={styles.actionLink}>Make Owner</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />
      <Toast message={toastMessage} />
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: { padding: 24 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  settingTextCol: { flex: 1 },
  memberCard: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function orgSettingsStyles(c: ThemeColors) {
  return {
    settingLabel: { fontSize: 15, fontWeight: '600' as const, color: c.text },
    settingHint: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    sectionHeader: {
      marginTop: 16,
      marginBottom: 8,
      fontWeight: '700' as const,
      fontSize: 16,
      color: c.text,
    },
    serial: {
      width: 28,
      fontSize: 15,
      fontWeight: '800' as const,
      color: c.textMuted,
    },
    memberName: { flex: 1, fontSize: 16, fontWeight: '700' as const, color: c.text },
    actionLink: { color: c.link, fontWeight: '600' as const },
    removeLink: { color: c.danger, fontWeight: '600' as const },
  };
}
