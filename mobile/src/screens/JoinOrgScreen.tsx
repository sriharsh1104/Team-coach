import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { MembershipRole } from '../api/types';
import { OrgSetupStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';
import { RoleSelector } from './RoleSelector';
import { FormScreen } from './FormScreen';

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
      <TextInput
        style={sharedStyles.input}
        placeholder="Org code (e.g. 75HCP3)"
        autoCapitalize="characters"
        value={orgCode}
        onChangeText={setOrgCode}
      />
      <Text style={styles.label}>Joining as:</Text>
      <RoleSelector value={role} onChange={setRole} />
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

const styles = StyleSheet.create({
  label: { marginBottom: 8, color: '#444' },
});
