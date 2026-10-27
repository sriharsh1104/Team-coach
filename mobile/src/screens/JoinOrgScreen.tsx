import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgSetupStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';
import { FormScreen } from './FormScreen';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'JoinOrg'>;

export function JoinOrgScreen({}: Props) {
  const { setOrg } = useAuth();
  const [orgCode, setOrgCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Role is always PLAYER on join — the org owner promotes coaches /
      // analysts from the roster afterwards.
      const org = await orgApi.joinOrg({ orgCode: orgCode.trim() });
      setOrg({ id: org.id, name: org.name, role: org.myRole, isOwner: org.isOwner });
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
    <FormScreen>
      <Text style={sharedStyles.title}>Join an Org</Text>
      <Text style={{ textAlign: 'center', color: '#555', marginBottom: 16 }}>
        You join as a Player. The org owner can promote you to Coach or Analyst.
      </Text>
      <TextInput
        style={sharedStyles.input}
        placeholder="Org code (e.g. 75HCP3)"
        autoCapitalize="characters"
        value={orgCode}
        onChangeText={setOrgCode}
      />
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
    </FormScreen>
  );
}
