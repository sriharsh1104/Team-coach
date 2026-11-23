import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { OrgDetail, OrgMember } from '../api/types';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from '../ui/SoftPressable';
import { AppIcon } from '../ui/AppIcon';
import { Toast, useToast } from '../ui/Toast';
import { confirmAsync } from '../ui/confirmAsync';
import { usePullToRefresh } from '../ui/usePullToRefresh';
import { SkeletonList } from '../ui/Skeleton';
import { ListSearchField } from '../ui/ListSearchField';
import { useDebouncedValue } from '../ui/useDebouncedValue';
import { matchesPersonQuery } from '../ui/usePagedSearch';

type Props = NativeStackScreenProps<MainStackParamList, 'OrgSettings'>;

/** Owner-only org settings. Roster seats stay on Members / Guild — this screen
 * only holds org-wide toggles and ownership transfer. */
export function OrgSettingsScreen({ navigation }: Props) {
  const { refreshOrg } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(orgSettingsStyles);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState('');
  const ownerQuery = useDebouncedValue(ownerSearch.trim().toLowerCase(), 300);
  const { message: toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    const data = await orgApi.getMyOrg();
    setDetail(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detail && !detail.isOwner) {
      // Reached directly (e.g. a stale deep link) by a non-owner — bounce out.
      navigation.goBack();
    }
  }, [detail, navigation]);

  const refreshControl = usePullToRefresh(load);

  // OrgDetail members are always on the roster; filter non-owners only.
  const transferCandidates: OrgMember[] = useMemo(
    () => (detail?.members ?? []).filter((m) => !m.isOwner),
    [detail?.members],
  );
  const filteredCandidates = useMemo(
    () =>
      transferCandidates.filter((m) =>
        matchesPersonQuery(ownerQuery, {
          name: m.name,
          email: m.email,
          inGameName: m.inGameName,
        }),
      ),
    [transferCandidates, ownerQuery],
  );

  const onToggleHistory = async (value: boolean) => {
    setDetail((prev) => (prev ? { ...prev, historyVisibleToNewMembers: value } : prev));
    try {
      await orgApi.updateOrgSettings(value);
      showToast(
        value
          ? 'New members can now see full chat history'
          : 'New members only see chat from when they join',
      );
    } catch {
      setDetail((prev) =>
        prev ? { ...prev, historyVisibleToNewMembers: !value } : prev,
      );
      /* API error toasted by axios interceptor */
    }
  };

  const onPickOwner = async (member: OrgMember) => {
    setPickerOpen(false);
    setOwnerSearch('');
    const confirmed = await confirmAsync(
      'Transfer Ownership?',
      `Do you want to transfer ownership to ${member.name}? You will no longer be the owner.`,
      'Yes',
      'No',
    );
    if (!confirmed) return;
    try {
      await orgApi.transferOwnership(member.userId);
      showToast(`${member.name} is now the owner`);
      await refreshOrg();
      await load();
    } catch {
      /* API error toasted by axios interceptor */
    }
  };

  if (!detail) {
    return (
      <Screen>
        <View style={staticStyles.loading}>
          <SkeletonList count={3} avatar={false} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={staticStyles.scroll}
        contentContainerStyle={staticStyles.content}
        refreshControl={refreshControl}
      >
        <View style={staticStyles.settingRow}>
          <View style={staticStyles.settingTextCol}>
            <Text style={styles.settingLabel}>Chat History For New Members</Text>
            <Text style={styles.settingHint}>
              Let a new member see Team Chat messages from before they joined.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Chat history for new members"
            value={detail.historyVisibleToNewMembers}
            onValueChange={(v) => void onToggleHistory(v)}
          />
        </View>

        <View style={staticStyles.card}>
          <Text style={styles.settingLabel}>Transfer Ownership</Text>
          <Text style={styles.settingHint}>
            Pass ownership to another roster member. You will lose owner
            controls.
          </Text>
          <SoftPressable
            style={[
              styles.transferBtn,
              transferCandidates.length === 0 && styles.transferBtnDisabled,
            ]}
            disabled={transferCandidates.length === 0}
            onPress={() => {
              setOwnerSearch('');
              setPickerOpen(true);
            }}
            pressScale={0.97}
            accessibilityRole="button"
            accessibilityLabel="Transfer ownership"
          >
            <View style={staticStyles.transferBtnInner}>
              <AppIcon name="crown-outline" size={18} color={colors.chromeInk} />
              <Text style={styles.transferBtnText}>Choose New Owner</Text>
            </View>
          </SoftPressable>
          {transferCandidates.length === 0 ? (
            <Text style={styles.emptyHint}>
              No other roster members yet — add someone before transferring.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPickerOpen(false);
          setOwnerSearch('');
        }}
        statusBarTranslucent
      >
        <View style={staticStyles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setPickerOpen(false);
              setOwnerSearch('');
            }}
            accessibilityLabel="Dismiss"
          />
          <View
            style={[
              staticStyles.modalCard,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
          >
            <Text style={[staticStyles.modalTitle, { color: colors.text }]}>
              Choose New Owner
            </Text>
            <Text style={[staticStyles.modalMessage, { color: colors.textMuted }]}>
              Select a roster member, then confirm the transfer.
            </Text>
            <ListSearchField
              value={ownerSearch}
              onChangeText={setOwnerSearch}
              placeholder="Search by name or email"
              accessibilityLabel="Search owner candidates"
            />
            <ScrollView
              style={staticStyles.candidateList}
              contentContainerStyle={staticStyles.candidateListContent}
              keyboardShouldPersistTaps="handled"
            >
              {filteredCandidates.length === 0 ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    textAlign: 'center',
                    paddingVertical: 12,
                  }}
                >
                  {ownerQuery ? 'No matches.' : 'No candidates.'}
                </Text>
              ) : (
                filteredCandidates.map((member) => (
                  <SoftPressable
                    key={member.userId}
                    style={styles.candidate}
                    onPress={() => void onPickOwner(member)}
                    pressScale={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${member.name}`}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.candidateName}>{member.name}</Text>
                      {member.email ? (
                        <Text style={styles.candidateRole} numberOfLines={1}>
                          {member.email}
                        </Text>
                      ) : null}
                    </View>
                    {member.role ? (
                      <Text style={styles.candidateRole}>
                        {member.role.charAt(0) +
                          member.role.slice(1).toLowerCase()}
                      </Text>
                    ) : null}
                  </SoftPressable>
                ))
              )}
            </ScrollView>
            <Pressable
              onPress={() => {
                setPickerOpen(false);
                setOwnerSearch('');
              }}
              style={({ pressed }) => [
                staticStyles.cancelBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
                pressed && staticStyles.btnPressed,
              ]}
              accessibilityLabel="Cancel"
            >
              <Text style={[staticStyles.cancelLabel, { color: colors.text }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Toast message={toastMessage} />
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 24, gap: 16, paddingBottom: 40 },
  loading: { padding: 24 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  settingTextCol: { flex: 1 },
  transferBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 12,
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  candidateList: { maxHeight: 280 },
  candidateListContent: { gap: 8, paddingVertical: 4 },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelLabel: { fontSize: 15, fontWeight: '700' },
  btnPressed: { opacity: 0.72 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function orgSettingsStyles(c: ThemeColors) {
  return {
    settingLabel: { fontSize: 15, fontWeight: '600' as const, color: c.text },
    settingHint: { fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 16 },
    emptyHint: { fontSize: 12, color: c.textMuted, lineHeight: 16 },
    transferBtn: {
      marginTop: 4,
      backgroundColor: c.chrome,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    transferBtnDisabled: { opacity: 0.45 },
    transferBtnText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 15,
    },
    candidate: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: c.surface,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      gap: 8,
    },
    candidateName: {
      flex: 1,
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 15,
    },
    candidateRole: {
      color: c.textMuted,
      fontWeight: '600' as const,
      fontSize: 12,
    },
  };
}
