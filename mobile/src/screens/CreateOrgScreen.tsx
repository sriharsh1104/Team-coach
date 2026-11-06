import React, { useState } from 'react';
import { Modal, Text, TextInput, View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { OrgSetupStackParamList } from '../navigation/types';
import { authStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { AuthBackButton } from '../ui/AuthBackButton';
import { CopyButton } from './profile/CopyButton';
import { colors } from '../theme';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'CreateOrg'>;

type CreatedOrg = {
  id: string;
  name: string;
  orgCode: string;
  myRole: OrgDetail['myRole'];
  isOwner: boolean;
};

export function CreateOrgScreen({ navigation }: Props) {
  const { setOrg } = useAuth();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedOrg | null>(null);

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const org = await orgApi.createOrg(name.trim());
      setCreated({
        id: org.id,
        name: org.name,
        orgCode: org.orgCode,
        myRole: org.myRole,
        isOwner: org.isOwner,
      });
    } catch {
      // API message is shown by the global axios → toaster interceptor.
    } finally {
      setIsSubmitting(false);
    }
  };

  const onContinue = () => {
    if (!created) return;
    setOrg({
      id: created.id,
      name: created.name,
      role: created.myRole,
      isOwner: created.isOwner,
    });
  };

  return (
    <FormScreen>
      <AuthBackButton onPress={() => navigation.navigate('OrgChoice')} />
      <Text style={authStyles.title}>Create a Org</Text>
      <Text style={{ color: '#9aa0a6', textAlign: 'center', marginBottom: 16 }}>
        You become the owner. A coach can be you or someone else.
      </Text>
      <TextInput
        style={authStyles.input}
        placeholder="Org / team name"
        placeholderTextColor="#8b8f97"
        value={name}
        onChangeText={setName}
      />
      <SoftPressable
        style={[
          authStyles.button,
          (isSubmitting || !name) && authStyles.buttonDisabled,
        ]}
        disabled={isSubmitting || !name}
        onPress={onSubmit}
        pressScale={0.98}
      >
        <ButtonLabel icon="add-circle">Create Org</ButtonLabel>
      </SoftPressable>

      <Modal visible={!!created} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Org created 🎉</Text>
            <Text style={styles.cardHint}>
              Share this code with your team so they can join {created?.name}.
            </Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeValue}>{created?.orgCode}</Text>
              <CopyButton value={created?.orgCode ?? ''} />
            </View>
            <SoftPressable
              style={styles.continueBtn}
              onPress={onContinue}
              pressScale={0.98}
            >
              <ButtonLabel icon="arrow-forward">Continue</ButtonLabel>
            </SoftPressable>
          </View>
        </View>
      </Modal>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    backgroundColor: '#15161a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  codeValue: {
    color: colors.chrome,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
  continueBtn: {
    backgroundColor: colors.chrome,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
