import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgSetupStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { AuthBackButton } from '../ui/AuthBackButton';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'JoinOrg'>;

const CODE_LENGTH = 8;

function extractInviteRef(raw: string): string | undefined {
  const match = raw.trim().match(/[?&]ref=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function isRosterInvite(raw: string): boolean {
  return /[?&]seat=roster(?:&|$)/.test(raw.trim());
}

export function JoinOrgScreen({ navigation }: Props) {
  const { setGuild, setOrg } = useAuth();
  const [orgCode, setOrgCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const trimmed = orgCode.trim();
      const looksLikeCode =
        trimmed.length === CODE_LENGTH && !/[/:.]/.test(trimmed);
      const invitedByUserId = extractInviteRef(trimmed);
      const rosterSeat = isRosterInvite(trimmed);

      if (rosterSeat) {
        const joined = await orgApi.joinOrg(
          looksLikeCode
            ? { rosterCode: trimmed.toUpperCase() }
            : { referralToken: trimmed },
        );
        setOrg({
          id: joined.id,
          name: joined.name,
          role: joined.myRole,
          isOwner: joined.isOwner,
        });
        setGuild({ id: joined.id, name: joined.name, role: 'MEMBER' });
        return;
      }

      if (looksLikeCode) {
        // Typed code: try guild first, then roster (codes are distinct).
        try {
          const joined = await orgApi.joinGuild({
            orgCode: trimmed.toUpperCase(),
          });
          setGuild({ id: joined.id, name: joined.name, role: joined.role });
          return;
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response
            ?.status;
          if (status !== 404) throw err;
          const joined = await orgApi.joinOrg({
            rosterCode: trimmed.toUpperCase(),
          });
          setOrg({
            id: joined.id,
            name: joined.name,
            role: joined.myRole,
            isOwner: joined.isOwner,
          });
          setGuild({ id: joined.id, name: joined.name, role: 'MEMBER' });
          return;
        }
      }

      const joined = await orgApi.joinGuild({
        referralToken: trimmed,
        invitedByUserId,
      });
      setGuild({ id: joined.id, name: joined.name, role: joined.role });
    } catch {
      // API message is shown by the global axios → toaster interceptor.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <AuthBackButton onPress={() => navigation.navigate('OrgChoice')} />
      <Text style={authStyles.title}>Join with invite</Text>
      <Text style={{ textAlign: 'center', color: '#9aa0a6', marginBottom: 16 }}>
        Paste a guild or roster invite link, or enter the matching code.
        Already registered users can join without signing up again.
      </Text>
      <TextInput
        style={authStyles.input}
        placeholder="Code or invite link"
        placeholderTextColor="#8b8f97"
        autoCapitalize="none"
        value={orgCode}
        onChangeText={setOrgCode}
      />
      <SoftPressable
        style={[
          authStyles.button,
          (isSubmitting || !orgCode) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !orgCode}
        onPress={onSubmit}
        pressScale={0.98}
      >
        <ButtonLabel icon="enter">Join</ButtonLabel>
      </SoftPressable>
    </FormScreen>
  );
}
