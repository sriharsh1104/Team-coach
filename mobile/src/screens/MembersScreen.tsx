import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { sharedStyles } from './shared';

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
        renderItem={({ item }) => (
          <Pressable
            style={styles.memberRow}
            onPress={() =>
              navigation.navigate('MemberProfile', {
                userId: item.userId,
                name: item.name,
              })
            }
          >
            <Text style={styles.memberName}>
              {item.name}
              {item.isOwner ? ' (Owner)' : ''}
            </Text>
            <Text style={styles.memberRole}>{item.role}</Text>
          </Pressable>
        )}
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
  memberName: { fontSize: 16, color: colors.text },
  memberRole: { color: colors.textMuted },
});
