import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { roleLabel } from '../api/roles';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { SoftPressable } from '../ui/SoftPressable';
import { CopyButton } from './profile/CopyButton';

function formatInGameRoles(roles: string[]): string | null {
  if (roles.length === 0) return null;
  return roles.map(roleLabel).join(', ');
}

type Props = NativeStackScreenProps<MainStackParamList, 'Members'>;

/** Esports roster list. Owner/coach see a distinct roster code + invite link. */
export function MembersScreen({ navigation }: Props) {
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await orgApi.getMyOrg();
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

  const canInviteRoster =
    !!detail?.canInviteRoster &&
    !!detail.rosterReferralLink &&
    !!detail.rosterCode;

  return (
    <Screen>
      <FlatList
        style={styles.list}
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
                <View style={styles.inviteCard}>
                  <Text style={styles.inviteTitle}>Esports Roster Invite</Text>
                  <Text style={styles.inviteHint}>
                    Owner/coach only. Roster code is separate from the guild
                    code. Already registered users can open the link and join
                    without a new signup.
                  </Text>
                  <View style={styles.inviteRow}>
                    <View style={styles.inviteTextCol}>
                      <Text style={styles.inviteLabel}>Roster Code</Text>
                      <Text style={styles.inviteValue}>{detail.rosterCode}</Text>
                    </View>
                    <CopyButton value={detail.rosterCode!} />
                  </View>
                  <View style={styles.inviteRow}>
                    <View style={styles.inviteTextCol}>
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
                  coach can share roster invites.
                </Text>
              )}
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const inGameRoles = formatInGameRoles(item.inGameRoles);
          return (
            <SoftPressable
              style={styles.memberRow}
              onPress={() =>
                navigation.push('MemberProfile', {
                  userId: item.userId,
                  name: item.name,
                })
              }
              pressScale={0.985}
            >
              <View style={styles.memberInfo}>
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
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: { padding: 24, paddingBottom: 40 },
  rosterHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  inviteCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  inviteTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  inviteHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
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
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    marginBottom: 6,
    gap: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, color: colors.text, fontWeight: '600' },
  memberInGameRoles: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  memberRole: { color: colors.textMuted, fontWeight: '600', fontSize: 12 },
});
