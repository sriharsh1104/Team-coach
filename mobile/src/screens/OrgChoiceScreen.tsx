import React from 'react';
import { Text, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { OrgSetupStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'OrgChoice'>;

export function OrgChoiceScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  return (
    <FormScreen>
      <BrandMark />
      <Text style={authStyles.title}>Welcome, {user?.name}</Text>
      <Pressable
        style={authStyles.button}
        onPress={() => navigation.navigate('CreateOrg')}
      >
        <ButtonLabel icon="add-circle">Create an Org</ButtonLabel>
      </Pressable>
      <Pressable
        style={authStyles.button}
        onPress={() => navigation.navigate('JoinOrg')}
      >
        <ButtonLabel icon="enter">Join an Org</ButtonLabel>
      </Pressable>
      <Text style={authStyles.link} onPress={logout}>
        Log Out
      </Text>
    </FormScreen>
  );
}
