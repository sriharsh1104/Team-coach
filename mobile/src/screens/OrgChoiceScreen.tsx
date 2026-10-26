import React from 'react';
import { Text, Pressable, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { OrgSetupStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'OrgChoice'>;

export function OrgChoiceScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  return (
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Welcome, {user?.name}</Text>
      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('CreateOrg')}
      >
        <Text style={sharedStyles.buttonText}>Create an Org</Text>
      </Pressable>
      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('JoinOrg')}
      >
        <Text style={sharedStyles.buttonText}>Join an Org</Text>
      </Pressable>
      <Text style={sharedStyles.link} onPress={logout}>
        Log out
      </Text>
    </View>
  );
}
