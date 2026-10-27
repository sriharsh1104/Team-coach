import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { MembershipRole } from '../api/types';
import { OrgSetupStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { RoleSelector } from './RoleSelector';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'CreateOrg'>;

export function CreateOrgScreen({}: Props) {
  const { setOrg } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<MembershipRole>('COACH');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const org = await orgApi.createOrg(name.trim(), role);
      Alert.alert(
        'Org created',
        `Share this with your team:\n\nOrg code: ${org.orgCode}`,
      );
      setOrg({ id: org.id, name: org.name, role: org.myRole, isOwner: org.isOwner });
    } catch (err: any) {
      Alert.alert(
        'Could not create org',
        err?.response?.data?.message ?? 'Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <Text style={authStyles.title}>Create an Org</Text>
      <TextInput
        style={authStyles.input}
        placeholder="Org / team name"
        placeholderTextColor="#8b8f97"
        value={name}
        onChangeText={setName}
      />
      <Text style={roleStyles.label}>I am joining this org as a:</Text>
      <RoleSelector value={role} onChange={setRole} />
      <Pressable
        style={[
          authStyles.button,
          (isSubmitting || !name) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !name}
        onPress={onSubmit}
      >
        <ButtonLabel icon="add-circle">Create Org</ButtonLabel>
      </Pressable>
    </FormScreen>
  );
}

const roleStyles = StyleSheet.create({
  label: { marginBottom: 8, color: '#9aa0a6' },
});
