import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { ROLE_LABELS, RoleOption } from '../api/roles';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { sharedStyles } from './shared';

function formatInGameRoles(roles: string[]): string | null {
  if (roles.length === 0) return null;
  return roles.map((r) => ROLE_LABELS[r as RoleOption] ?? r).join(', ');
}

type Props = NativeStackScreenProps<MainStackParamList, 'Members'>;

// Plain roster viewer for every member, regardless of role — owner-only
// management (change role, remove, transfer ownership) lives in
// OrgSettingsScreen instead.
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
          <Text style={sharedStyles.title}>Team Members</Text>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const inGameRoles = formatInGameRoles(item.inGameRoles);
          return (
            <Pressable
              style={styles.memberRow}
              onPress={() =>
                navigation.navigate('MemberProfile', {
                  userId: item.userId,
                  name: item.name,
                })
              }
            >
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {item.name}
                  {item.isOwner ? ' (Owner)' : ''}
                </Text>
                {inGameRoles && (
                  <Text style={styles.memberInGameRoles}>{inGameRoles}</Text>
                )}
              </View>
              <Text style={styles.memberRole}>{item.role}</Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: { padding: 24 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, color: colors.text },
  memberInGameRoles: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  memberRole: { color: colors.textMuted },
});
