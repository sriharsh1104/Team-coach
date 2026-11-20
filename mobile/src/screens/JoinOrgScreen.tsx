import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgSetupStackParamList } from '../navigation/types';
import { useSharedStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { AuthBackButton } from '../ui/AuthBackButton';
import { inviteToJoinInput, takePendingInvite, usePendingInvite } from '../invite/inviteLinks';

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
  const shared = useSharedStyles();
  const { setGuild, setOrg, refreshOrg } = useAuth();
  const [orgCode, setOrgCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (override?: string) => {
    setIsSubmitting(true);
    try {
      const trimmed = (override ?? orgCode).trim();
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
        await refreshOrg();
        return;
      }

      if (looksLikeCode) {
        // Typed code: try guild first, then roster (codes are distinct).
        try {
          const joined = await orgApi.joinGuild({
            orgCode: trimmed.toUpperCase(),
          });
          setGuild({ id: joined.id, name: joined.name, role: joined.role });
          await refreshOrg();
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
          await refreshOrg();
          return;
        }
      }

      const joined = await orgApi.joinGuild({
        referralToken: trimmed,
        invitedByUserId,
      });
      setGuild({ id: joined.id, name: joined.name, role: joined.role });
      // Confirm /me so RootNavigator leaves OrgChoice for GuildHome.
      await refreshOrg();
    } catch {
      // API message is shown by the global axios → toaster interceptor.
    } finally {
      setIsSubmitting(false);
    }
  };

  // An invite link the user tapped (or that arrived before sign-in): fill it
  // in and join straight away — no copy/paste.
  const pendingInvite = usePendingInvite();
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!pendingInvite || autoJoined.current) return;
    autoJoined.current = true;
    const invite = takePendingInvite();
    if (!invite) {
      autoJoined.current = false;
      return;
    }
    const input = inviteToJoinInput(invite);
    setOrgCode(input);
    void onSubmit(input).finally(() => {
      autoJoined.current = false;
    });
    // onSubmit closes over setters only; run once per arriving invite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite]);

  return (
    <FormScreen>
      <AuthBackButton onPress={() => navigation.navigate('OrgChoice')} />
      <Text style={shared.title}>Join with invite</Text>
      <Text style={{ textAlign: 'center', color: '#9aa0a6', marginBottom: 16 }}>
        Paste a guild or roster invite link, or enter the matching code.
        Already registered users can join without signing up again.
      </Text>
      <TextInput
        style={shared.input}
        placeholder="Code or invite link"
        placeholderTextColor="#8b8f97"
        autoCapitalize="none"
        value={orgCode}
        onChangeText={setOrgCode}
      />
      <SoftPressable
        style={[
          shared.button,
          (isSubmitting || !orgCode) && shared.buttonDisabled,
        ]}
        disabled={isSubmitting || !orgCode}
        onPress={() => void onSubmit()}
        pressScale={0.98}
      >
        <ButtonLabel icon="enter">Join</ButtonLabel>
      </SoftPressable>
    </FormScreen>
  );
}
