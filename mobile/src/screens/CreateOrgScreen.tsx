import React, { useState } from 'react';
import { Text, TextInput, Pressable, Alert, View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { MembershipRole } from '../api/types';
import { OrgSetupStackParamList } from '../navigation/types';
import { sharedStyles } from './shared';

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
      setOrg({ id: org.id, name: org.name, role: org.myRole });
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
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Create an Org</Text>
      <TextInput
        style={sharedStyles.input}
        placeholder="Org / team name"
        value={name}
        onChangeText={setName}
      />
      <Text style={roleStyles.label}>I am joining this org as a:</Text>
      <View style={roleStyles.row}>
        <Pressable
          style={[roleStyles.pill, role === 'PLAYER' && roleStyles.pillActive]}
          onPress={() => setRole('PLAYER')}
        >
          <Text style={role === 'PLAYER' ? roleStyles.pillTextActive : roleStyles.pillText}>
            Player
          </Text>
        </Pressable>
        <Pressable
          style={[roleStyles.pill, role === 'COACH' && roleStyles.pillActive]}
          onPress={() => setRole('COACH')}
        >
          <Text style={role === 'COACH' ? roleStyles.pillTextActive : roleStyles.pillText}>
            Coach
          </Text>
        </Pressable>
      </View>
      <Pressable
        style={[
          sharedStyles.button,
          (isSubmitting || !name) && sharedStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !name}
        onPress={onSubmit}
      >
        <Text style={sharedStyles.buttonText}>Create Org</Text>
      </Pressable>
    </View>
  );
}

const roleStyles = StyleSheet.create({
  label: { marginBottom: 8, color: '#444' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  pill: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pillActive: { backgroundColor: '#111', borderColor: '#111' },
  pillText: { color: '#111' },
  pillTextActive: { color: '#fff' },
});
