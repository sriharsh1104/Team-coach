import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import * as chatApi from '../api/chat';
import { OrgDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { OrgSetupStackParamList } from '../navigation/types';
import { useSharedStyles } from './shared';
import { FormScreen } from './FormScreen';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { AuthBackButton } from '../ui/AuthBackButton';
import { CopyButton } from './profile/CopyButton';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { emitToast } from '../ui/toastBus';
import { apiErrorMessage } from '../api/apiErrorMessage';

/** Same key ChatService.GUILD_CHANNEL — guild chat photo doubles as org logo. */
const GUILD_CHANNEL = 'guild';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'CreateOrg'>;

type CreatedOrg = {
  id: string;
  name: string;
  orgCode: string;
  myRole: OrgDetail['myRole'];
  isOwner: boolean;
};

type LogoPick = {
  uri: string;
  fileName: string;
  mimeType: string;
};

export function CreateOrgScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const { setOrg } = useAuth();
  const styles = useThemedStyles(createOrgStyles);
  const [name, setName] = useState('');
  const [freeFireGuildId, setFreeFireGuildId] = useState('');
  const [logo, setLogo] = useState<LogoPick | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedOrg | null>(null);

  const onPickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow gallery access to set a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setLogo({
      uri: asset.uri,
      fileName: asset.fileName ?? `org-logo-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  };

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const org = await orgApi.createOrg(name.trim(), {
        freeFireGuildId: freeFireGuildId.trim() || undefined,
      });
      if (logo) {
        try {
          await chatApi.uploadChannelAvatar(GUILD_CHANNEL, logo);
        } catch (err) {
          emitToast(
            apiErrorMessage(
              err,
              'Org created, but the logo could not be uploaded',
            ),
          );
        }
      }
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
      <Text style={shared.title}>Create a Org</Text>
      <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: 16 }}>
        You become the owner. Add a logo so your guild stands out in the list.
      </Text>

      <SoftPressable
        style={styles.logoPicker}
        onPress={() => void onPickLogo()}
        pressScale={0.97}
        accessibilityRole="button"
        accessibilityLabel={logo ? 'Change org logo' : 'Add org logo'}
      >
        <View style={styles.logoCircle}>
          {logo ? (
            <Image
              source={{ uri: logo.uri }}
              style={staticStyles.logoImg}
              contentFit="cover"
            />
          ) : (
            <Text style={styles.logoPlaceholder}>
              {(name.trim()[0] ?? '+').toUpperCase()}
            </Text>
          )}
        </View>
        <Text style={styles.logoHint}>
          {logo ? 'Change Logo' : 'Add Logo (Optional)'}
        </Text>
      </SoftPressable>
      {logo ? (
        <SoftPressable
          onPress={() => setLogo(null)}
          pressScale={0.98}
          accessibilityRole="button"
          accessibilityLabel="Remove logo"
        >
          <Text style={styles.removeLogo}>Remove Logo</Text>
        </SoftPressable>
      ) : null}

      <TextInput
        style={shared.input}
        placeholder="Org / team name"
        placeholderTextColor={colors.textDim}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={shared.input}
        placeholder="Free Fire guild ID (optional)"
        placeholderTextColor={colors.textDim}
        value={freeFireGuildId}
        onChangeText={(t) => setFreeFireGuildId(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        accessibilityLabel="Free Fire guild ID, optional"
      />
      <SoftPressable
        style={[
          shared.button,
          (isSubmitting || !name.trim()) && shared.buttonDisabled,
        ]}
        disabled={isSubmitting || !name.trim()}
        onPress={() => void onSubmit()}
        pressScale={0.98}
      >
        <ButtonLabel icon="add-circle">
          {isSubmitting ? 'Creating…' : 'Create Org'}
        </ButtonLabel>
      </SoftPressable>

      <Modal visible={!!created} transparent animationType="fade">
        <View style={staticStyles.backdrop}>
          <View style={[staticStyles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={styles.cardTitle}>Org Created</Text>
            <Text style={styles.cardHint}>
              Share this code with your team so they can join {created?.name}.
            </Text>
            <View style={[staticStyles.codeRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
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

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
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
    borderWidth: 1,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  logoImg: { width: '100%', height: '100%' },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function createOrgStyles(c: ThemeColors) {
  return {
    logoPicker: {
      alignItems: 'center' as const,
      marginBottom: 8,
      gap: 8,
    },
    logoCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      overflow: 'hidden' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    logoPlaceholder: {
      color: c.chrome,
      fontSize: 28,
      fontWeight: '800' as const,
    },
    logoHint: {
      color: c.link,
      fontWeight: '600' as const,
      fontSize: 14,
    },
    removeLogo: {
      color: c.textMuted,
      textAlign: 'center' as const,
      fontSize: 13,
      marginBottom: 12,
      fontWeight: '500' as const,
    },
    cardTitle: {
      color: c.text,
      fontSize: 20,
      fontWeight: '800' as const,
      textAlign: 'center' as const,
      marginBottom: 8,
    },
    cardHint: {
      color: c.textMuted,
      fontSize: 13,
      textAlign: 'center' as const,
      lineHeight: 18,
      marginBottom: 18,
    },
    codeValue: {
      color: c.chrome,
      fontSize: 20,
      fontWeight: '800' as const,
      letterSpacing: 2,
    },
    continueBtn: {
      backgroundColor: c.chrome,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center' as const,
    },
  };
}
