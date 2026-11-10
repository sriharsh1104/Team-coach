import React from 'react';
import { Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { OrgSetupStackParamList } from '../navigation/types';
import { useSharedStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'OrgChoice'>;

export function OrgChoiceScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const { user, logout } = useAuth();

  return (
    // Key by user so a logout → other login never paints overlapping buttons
    // from the previous account's OrgChoice instance.
    <FormScreen key={user?.id ?? 'choice'}>
      <BrandMark />
      <Text style={shared.title}>Welcome, {user?.name}</Text>
      <SoftPressable
        style={shared.button}
        onPress={() => navigation.navigate('CreateOrg')}
        pressScale={0.98}
      >
        <ButtonLabel icon="add-circle">Create a Org</ButtonLabel>
      </SoftPressable>
      <SoftPressable
        style={shared.button}
        onPress={() => navigation.navigate('JoinOrg')}
        pressScale={0.98}
      >
        <ButtonLabel icon="enter">Join a Org</ButtonLabel>
      </SoftPressable>
      <Text style={shared.link} onPress={logout}>
        Log Out
      </Text>
    </FormScreen>
  );
}
