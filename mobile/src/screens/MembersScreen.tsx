import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { MembershipRole, OrgDetail, OrgMember } from '../api/types';
import { roleLabel } from '../api/roles';
import { MainStackParamList } from '../navigation/types';
import { useOrgRealtimeOptional } from '../realtime/OrgRealtimeProvider';
import { Screen } from '../brand/Screen';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from '../ui/SoftPressable';
import { InviteQr } from '../ui/InviteQr';
import { CopyButton } from './profile/CopyButton';
import { RoleSelector } from './RoleSelector';
import { emitToast } from '../ui/toastBus';
import { confirmAsync } from '../ui/confirmAsync';
import { apiErrorMessage } from '../api/apiErrorMessage';

function formatInGameRoles(roles: string[]): string | null {
  if (roles.length === 0) return null;
  return roles.map(roleLabel).join(', ');
}

type Props = NativeStackScreenProps<MainStackParamList, 'Members'>;

/** Esports roster list. Owner/coach see invite + add/remove controls. */
export function MembersScreen({ navigation }: Props) {
  const { user, refreshOrg } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(membersStyles);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const realtime = useOrgRealtimeOptional();

  const load = useCallback(async () => {
    const data = await orgApi.getMyOrg();
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

  const canManage =
    !!detail?.canInviteRoster || !!detail?.isOwner;
  const canChangeRoles = !!detail?.isOwner;

  const onChangeRole = async (member: OrgMember, role: MembershipRole) => {
    if (role === member.role) return;
    setBusyId(member.userId);
    try {
      await orgApi.changeMemberRole(member.userId, role);
      emitToast(
        `${member.name} is now ${role.charAt(0)}${role.slice(1).toLowerCase()}`,
      );
      await refreshOrg();
      await load();
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not change role'));
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (member: OrgMember) => {
    const confirmed = await confirmAsync(
      'Remove Member',
      `Remove ${member.name} from the roster? They will need a new invite to rejoin.`,
      'Remove',
    );
    if (!confirmed) return;
    setBusyId(member.userId);
    try {
      await orgApi.removeMember(member.userId);
      emitToast(`${member.name} removed`);
      await load();
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not remove member'));
    } finally {
      setBusyId(null);
    }
  };

  const canInviteRoster =
    !!detail?.canInviteRoster &&
    !!detail.rosterReferralLink &&
    !!detail.rosterCode;

  return (
    <Screen>
      <FlatList
        style={staticStyles.list}
        data={detail?.members ?? []}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.chrome}
          />
        }
        ListHeaderComponent={
          detail ? (
            <View>
              {canInviteRoster ? (
                <View style={staticStyles.inviteCard}>
                  <Text style={styles.inviteTitle}>Esports Roster Invite</Text>
                  <Text style={styles.inviteHint}>
                    Owner/coach only. Share this to add someone to the roster.
                    Already registered users can open the link and join without
                    a new signup.
                  </Text>
                  <InviteQr value={detail.rosterReferralLink!} label="Scan to join roster" />
                  <View style={styles.inviteRow}>
                    <View style={staticStyles.inviteTextCol}>
                      <Text style={styles.inviteLabel}>Roster Code</Text>
                      <Text style={styles.inviteValue}>{detail.rosterCode}</Text>
                    </View>
                    <CopyButton value={detail.rosterCode!} />
                  </View>
                  <View style={styles.inviteRow}>
                    <View style={staticStyles.inviteTextCol}>
                      <Text style={styles.inviteLabel}>Roster Invite Link</Text>
                      <Text style={styles.inviteValue} numberOfLines={1}>
                        {detail.rosterReferralLink}
                      </Text>
                    </View>
                    <CopyButton value={detail.rosterReferralLink!} />
                  </View>
                </View>
              ) : (
                <Text style={styles.rosterHint}>
                  {detail.members.length} roster member
                  {detail.members.length === 1 ? '' : 's'}. Only the owner or a
                  coach can share roster invites or remove members.
                </Text>
              )}
              {canManage ? (
                <Text style={styles.manageHint}>
                  Tap − to remove someone
                  {canChangeRoles ? ', or change their role below' : ''}.
                </Text>
              ) : null}
            </View>
          ) : null
        }
        contentContainerStyle={staticStyles.listContent}
        renderItem={({ item, index }) => {
          const inGameRoles = formatInGameRoles(item.inGameRoles);
          const showRemove =
            canManage &&
            !item.isOwner &&
            item.userId !== user?.id &&
            !(
              !detail?.isOwner &&
              detail?.myRole === 'COACH' &&
              item.role === 'COACH'
            );
          return (
            <View style={staticStyles.memberCard}>
              <SoftPressable
                style={staticStyles.memberRow}
                onPress={() =>
                  navigation.push('MemberProfile', {
                    userId: item.userId,
                    name: item.name,
                  })
                }
                pressScale={0.985}
              >
                <View style={staticStyles.memberInfo}>
                  <Text style={styles.memberName}>
                    {index + 1}. {item.name}
                    {item.isOwner ? ' (Owner)' : ''}
                  </Text>
                  {inGameRoles && (
                    <Text style={styles.memberInGameRoles}>{inGameRoles}</Text>
                  )}
                </View>
                <Text style={styles.memberRole}>{item.role}</Text>
              </SoftPressable>
              {canChangeRoles && !item.isOwner ? (
                <RoleSelector
                  value={item.role}
                  onChange={(role) => void onChangeRole(item, role)}
                />
              ) : null}
              {showRemove ? (
                <SoftPressable
                  style={styles.removeBtn}
                  disabled={busyId === item.userId}
                  onPress={() => void onRemove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                  pressScale={0.94}
                >
                  <Ionicons name="person-remove-outline" size={18} color={colors.text} />
                  <Text style={styles.removeLabel}>Remove</Text>
                </SoftPressable>
              ) : null}
            </View>
          );
        }}
      />
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: { padding: 24, paddingBottom: 40 },
  inviteCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  inviteTextCol: { flex: 1 },
  memberCard: {
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    gap: 8,
  },
  memberInfo: { flex: 1 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function membersStyles(c: ThemeColors) {
  return {
    removeBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      alignSelf: 'flex-start' as const,
      marginHorizontal: 12,
      marginBottom: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    },
    rosterHint: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 16,
    },
    manageHint: {
      color: c.textMuted,
      fontSize: 12,
      marginBottom: 12,
      lineHeight: 16,
    },
    inviteTitle: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 16,
      marginBottom: 4,
    },
    inviteHint: {
      color: c.textMuted,
      fontSize: 12,
      marginBottom: 12,
      lineHeight: 16,
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
    memberName: { fontSize: 16, color: c.text, fontWeight: '600' as const },
    memberInGameRoles: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    memberRole: { color: c.textMuted, fontWeight: '600' as const, fontSize: 12 },
    removeLabel: { color: c.text, fontWeight: '600' as const, fontSize: 13 },
  };
}
