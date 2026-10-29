import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgSetupStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'JoinOrg'>;

// Org codes are always 6 characters (see org.service.ts's generateOrgCode);
// referral tokens are always 24 (generateReferralToken) — long enough that
// the two never collide, so one input field can accept either.
const ORG_CODE_LENGTH = 6;

export function JoinOrgScreen({}: Props) {
  const { setOrg } = useAuth();
  const [orgCode, setOrgCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const trimmed = orgCode.trim();
      // Role is always PLAYER on join — the org owner promotes coaches /
      // analysts from the roster afterwards.
      const org = await orgApi.joinOrg(
        trimmed.length === ORG_CODE_LENGTH
          ? { orgCode: trimmed }
          : { referralToken: trimmed },
      );
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
      <Text style={authStyles.title}>Join an Org</Text>
      <Text style={{ textAlign: 'center', color: '#9aa0a6', marginBottom: 16 }}>
        You join as a Player. The org owner can promote you to Coach or Analyst.
      </Text>
      <TextInput
        style={authStyles.input}
        placeholder="Org code or invite link"
        placeholderTextColor="#8b8f97"
        autoCapitalize="none"
        value={orgCode}
        onChangeText={setOrgCode}
      />
      <Pressable
        style={[
          authStyles.button,
          (isSubmitting || !orgCode) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !orgCode}
        onPress={onSubmit}
      >
        <ButtonLabel icon="enter">Join</ButtonLabel>
      </Pressable>
    </FormScreen>
  );
}
