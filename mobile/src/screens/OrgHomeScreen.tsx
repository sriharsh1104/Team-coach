import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, Pressable, RefreshControl } from 'react-native';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgDetail } from '../api/types';
import { sharedStyles } from './shared';

export function OrgHomeScreen() {
  const { logout, org } = useAuth();
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
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>{org?.name ?? detail?.name}</Text>
      {detail && (
        <Text style={{ textAlign: 'center', marginBottom: 16, color: '#555' }}>
          Org code: {detail.orgCode} · {detail.members.length} member(s)
        </Text>
      )}
      <FlatList
        data={detail?.members ?? []}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#eee',
            }}
          >
            <Text style={{ fontSize: 16 }}>{item.name}</Text>
            <Text style={{ color: '#888' }}>{item.role}</Text>
          </View>
        )}
      />
      <Pressable style={sharedStyles.link} onPress={logout}>
        <Text style={sharedStyles.link}>Log out</Text>
      </Pressable>
    </View>
  );
}
