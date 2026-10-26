import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, FlatList, Pressable, RefreshControl } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgDetail } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgHome'>;

export function OrgHomeScreen({ navigation }: Props) {
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
      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('Chat')}
      >
        <Text style={sharedStyles.buttonText}>Team Chat</Text>
      </Pressable>
      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('Voice')}
      >
        <Text style={sharedStyles.buttonText}>Team Voice</Text>
      </Pressable>
      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('MediaFeed')}
      >
        <Text style={sharedStyles.buttonText}>Media</Text>
      </Pressable>
      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('Scrims')}
      >
        <Text style={sharedStyles.buttonText}>Scrims & Tournaments</Text>
      </Pressable>
      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('Stats')}
      >
        <Text style={sharedStyles.buttonText}>Stats</Text>
      </Pressable>
      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={sharedStyles.buttonText}>Edit My Profile</Text>
      </Pressable>
      <FlatList
        data={detail?.members ?? []}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              navigation.navigate('MemberProfile', {
                userId: item.userId,
                name: item.name,
              })
            }
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
          </Pressable>
        )}
      />
      <Pressable style={sharedStyles.link} onPress={logout}>
        <Text style={sharedStyles.link}>Log out</Text>
      </Pressable>
    </View>
  );
}
