import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { MembershipRole, OrgDetail, OrgMember } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import { sharedStyles } from './shared';
import { RoleSelector } from './RoleSelector';
import { Toast, useToast } from '../ui/Toast';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgSettings'>;

// Owner-only screen — everything the owner can do to the roster lives here:
// change a member's role, remove them, or hand off ownership. MembersScreen
// stays a plain roster viewer for everyone else.
export function OrgSettingsScreen({ navigation }: Props) {
  const { refreshOrg } = useAuth();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { message: toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    const data = await orgApi.getMyOrg();
    setDetail(data);
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
      Alert.alert(
        'Could not change role',
        err?.response?.data?.message ?? 'Please try again.',
      );
    }
  };

  const onMakeOwner = (member: OrgMember) => {
    Alert.alert(
      'Make Owner',
      `Make ${member.name} the org owner? You will no longer be the owner.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Owner',
          onPress: async () => {
            try {
              await orgApi.transferOwnership(member.userId);
              await refreshOrg();
              await load();
            } catch (err: any) {
              Alert.alert(
                'Could not transfer ownership',
                err?.response?.data?.message ?? 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const onRemove = (member: OrgMember) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.name} from the org? They will need a new invite to rejoin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await orgApi.removeMember(member.userId);
              showToast(`${member.name} removed`);
              await load();
            } catch (err: any) {
              Alert.alert(
                'Could not remove member',
                err?.response?.data?.message ?? 'Please try again.',
              );
            }
          },
        },
      ],
    );
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
          <Text style={sharedStyles.title}>Org Settings</Text>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.memberCard}>
            <Text style={styles.memberName}>
              {item.name}
              {item.isOwner ? ' (Owner)' : ''}
            </Text>
            <RoleSelector
              value={item.role}
              onChange={(role) => onChangeRole(item, role)}
            />
            <View style={styles.actionsRow}>
              {!item.isOwner && (
                <Pressable onPress={() => onMakeOwner(item)}>
                  <Text style={styles.actionLink}>Make Owner</Text>
                </Pressable>
              )}
              {!item.isOwner && (
                <Pressable onPress={() => onRemove(item)}>
                  <Text style={styles.removeLink}>Remove</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
      <Toast message={toastMessage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: { padding: 24 },
  memberCard: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  memberName: { fontSize: 16, fontWeight: '700', color: colors.text },
  actionsRow: { flexDirection: 'row', gap: 20 },
  actionLink: { color: colors.link, fontWeight: '600' },
  removeLink: { color: colors.danger, fontWeight: '600' },
});
