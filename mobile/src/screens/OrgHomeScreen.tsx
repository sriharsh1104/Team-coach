import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, Pressable, RefreshControl, Alert, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { MembershipRole, OrgDetail, OrgMember } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgHome'>;

const ASSIGNABLE_ROLES: MembershipRole[] = ['PLAYER', 'COACH', 'ANALYST'];

export function OrgHomeScreen({ navigation }: Props) {
  const { logout, org, refreshOrg } = useAuth();
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

  const onChangeRole = (member: OrgMember) => {
    Alert.alert(
      `Change role — ${member.name}`,
      `Currently ${member.role}. Pick a new role (max 5 players, 2 coaches, 1 analyst).`,
      [
        ...ASSIGNABLE_ROLES.filter((role) => role !== member.role).map((role) => ({
          text: role.charAt(0) + role.slice(1).toLowerCase(),
          onPress: async () => {
            try {
              await orgApi.changeMemberRole(member.userId, role);
              await refreshOrg();
              await load();
            } catch (err: any) {
              Alert.alert(
                'Could not change role',
                err?.response?.data?.message ?? 'Please try again.',
              );
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const onMakeOwner = (member: OrgMember) => {
    Alert.alert(
      'Make owner',
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

  // Rendered as the FlatList's own header rather than wrapped around it —
  // letting the single FlatList own all scrolling avoids the old bug where
  // several full-width buttons plus a centered container clipped the member
  // list on short Android screens.
  const header = (
    <View>
      <Text style={sharedStyles.title}>{org?.name ?? detail?.name}</Text>
      {detail && (
        <Text style={styles.subtitle}>
          Org code: {detail.orgCode} · {detail.members.length} member(s)
        </Text>
      )}
      <Pressable style={sharedStyles.button} onPress={() => navigation.navigate('Chat')}>
        <Text style={sharedStyles.buttonText}>Team Chat</Text>
      </Pressable>
      <Pressable style={sharedStyles.button} onPress={() => navigation.navigate('Voice')}>
        <Text style={sharedStyles.buttonText}>Team Voice</Text>
      </Pressable>
      <Pressable style={sharedStyles.button} onPress={() => navigation.navigate('MediaFeed')}>
        <Text style={sharedStyles.buttonText}>Media</Text>
      </Pressable>
      <Pressable style={sharedStyles.button} onPress={() => navigation.navigate('Scrims')}>
        <Text style={sharedStyles.buttonText}>Scrims & Tournaments</Text>
      </Pressable>
      <Pressable style={sharedStyles.button} onPress={() => navigation.navigate('Stats')}>
        <Text style={sharedStyles.buttonText}>Stats</Text>
      </Pressable>
      <Pressable style={sharedStyles.button} onPress={() => navigation.navigate('Profile')}>
        <Text style={sharedStyles.buttonText}>Edit My Profile</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={detail?.members ?? []}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <Pressable style={sharedStyles.link} onPress={logout}>
            <Text style={sharedStyles.link}>Log out</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <Pressable
              style={styles.memberInfo}
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
            {org?.isOwner && (
              <View style={styles.ownerActions}>
                <Pressable onPress={() => onChangeRole(item)}>
                  <Text style={styles.actionLink}>Change Role</Text>
                </Pressable>
                {!item.isOwner && (
                  <Pressable onPress={() => onMakeOwner(item)}>
                    <Text style={styles.actionLink}>Make Owner</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  listContent: { padding: 24 },
  subtitle: { textAlign: 'center', marginBottom: 16, color: '#555' },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 8,
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  memberName: { fontSize: 16 },
  memberRole: { color: '#888' },
  ownerActions: { alignItems: 'flex-end', gap: 6 },
  actionLink: { color: '#2563eb', fontWeight: '600' },
});
