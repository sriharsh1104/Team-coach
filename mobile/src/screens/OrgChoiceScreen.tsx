import React from 'react';
import { Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { OrgSetupStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'OrgChoice'>;

export function OrgChoiceScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  return (
    <FormScreen>
      <BrandMark />
      <Text style={authStyles.title}>Welcome, {user?.name}</Text>
      <SoftPressable
        style={authStyles.button}
        onPress={() => navigation.navigate('CreateOrg')}
        pressScale={0.98}
      >
        <ButtonLabel icon="add-circle">Create an Org</ButtonLabel>
      </SoftPressable>
      <SoftPressable
        style={authStyles.button}
        onPress={() => navigation.navigate('JoinOrg')}
        pressScale={0.98}
      >
        <ButtonLabel icon="enter">Join an Org</ButtonLabel>
      </SoftPressable>
      <Text style={authStyles.link} onPress={logout}>
        Log Out
      </Text>
    </FormScreen>
  );
}
