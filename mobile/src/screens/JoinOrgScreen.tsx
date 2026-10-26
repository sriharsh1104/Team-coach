import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { MembershipRole } from '../api/types';
import { OrgSetupStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'JoinOrg'>;

export function JoinOrgScreen({}: Props) {
  const { setOrg } = useAuth();
  const [orgCode, setOrgCode] = useState('');
  const [role, setRole] = useState<MembershipRole>('PLAYER');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const org = await orgApi.joinOrg(role, { orgCode: orgCode.trim() });
      setOrg({ id: org.id, name: org.name, role: org.myRole });
    } catch (err: any) {
      Alert.alert(
        'Could not join org',
        err?.response?.data?.message ?? 'Check the code and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Join an Org</Text>
      <TextInput
        style={sharedStyles.input}
        placeholder="Org code (e.g. 75HCP3)"
        autoCapitalize="characters"
        value={orgCode}
        onChangeText={setOrgCode}
      />
      <Pressable
        style={sharedStyles.button}
        onPress={() => setRole(role === 'PLAYER' ? 'COACH' : 'PLAYER')}
      >
        <Text style={sharedStyles.buttonText}>
          Joining as: {role === 'PLAYER' ? 'Player' : 'Coach'} (tap to switch)
        </Text>
      </Pressable>
      <Pressable
        style={[
          sharedStyles.button,
          (isSubmitting || !orgCode) && sharedStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !orgCode}
        onPress={onSubmit}
      >
        <Text style={sharedStyles.buttonText}>Join</Text>
      </Pressable>
    </View>
  );
}
