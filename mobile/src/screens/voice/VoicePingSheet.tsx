import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as orgApi from '../../api/org';
import * as voiceApi from '../../api/voice';
import type { OrgMember } from '../../api/types';
import { AppIcon } from '../../ui/AppIcon';
import { haptic } from '../../ui/haptics';
import { emitToast } from '../../ui/toastBus';
import { ChannelAvatar } from '../chat/ChannelAvatar';

type Candidate = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Already sitting in the voice channel — nothing to ping them about. */
  inCall: boolean;
};

function memberName(m: OrgMember): string {
  return m.inGameName?.trim() || m.name;
}

/**
 * "Ping to join" — pick teammates and send them a *"<you> is waiting in Team
 * Voice"* notification that opens straight into the channel.
 *
 * Team voice only: guild voice is org-wide, where this would be a megaphone
 * rather than a nudge to the people you actually want in the call.
 */
export function VoicePingSheet({
  visible,
  onClose,
  selfUserId,
  inCallUserIds,
}: {
  visible: boolean;
  onClose: () => void;
  selfUserId: string | null;
  /** Everyone currently in the voice room, including you. */
  inCallUserIds: string[];
}) {
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const org = await orgApi.getMyOrg();
      setMembers(org.members ?? []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Fresh each open: the roster changes, and so does who is already in.
    setPicked(new Set());
    setMembers(null);
    void load();
  }, [visible, load]);

  const inCall = useMemo(() => new Set(inCallUserIds), [inCallUserIds]);

  const candidates = useMemo<Candidate[]>(() => {
    if (!members) return [];
    return members
      .filter((m) => m.userId !== selfUserId)
      .map((m) => ({
        userId: m.userId,
        name: memberName(m),
        avatarUrl: m.avatarUrl,
        inCall: inCall.has(m.userId),
      }))
      // People you can actually ping first; those already in the call sit at
      // the bottom as context ("they're here already"), not as noise on top.
      .sort((a, b) =>
        a.inCall === b.inCall ? a.name.localeCompare(b.name) : a.inCall ? 1 : -1,
      );
  }, [members, selfUserId, inCall]);

  const pingable = candidates.filter((c) => !c.inCall);
  const allPicked = pingable.length > 0 && picked.size === pingable.length;

  const toggle = (userId: string) => {
    haptic('selection');
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAll = () => {
    haptic('light');
    setPicked(allPicked ? new Set() : new Set(pingable.map((c) => c.userId)));
  };

  const send = async () => {
    if (picked.size === 0 || sending) return;
    setSending(true);
    try {
      const { sent, skipped } = await voiceApi.inviteToVoice([...picked]);
      haptic(sent > 0 ? 'success' : 'warning');
      if (sent > 0) {
        emitToast(
          `Pinged ${sent} ${sent === 1 ? 'teammate' : 'teammates'} to join.`,
        );
      } else if (skipped > 0) {
        // The server holds a repeat ping of the same person for a few minutes.
        emitToast('Already pinged recently — give them a minute.');
      } else {
        emitToast('No one to ping right now.');
      }
      onClose();
    } catch (err) {
      haptic('error');
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Could not send the ping. Try again.';
      emitToast(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => undefined}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Ping to join</Text>
              <Text style={styles.subtitle}>
                They get a notification that you&apos;re waiting in voice.
              </Text>
            </View>
            {pingable.length > 0 && (
              <Pressable
                onPress={toggleAll}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.selectAll}>
                  {allPicked ? 'Clear' : 'All'}
                </Text>
              </Pressable>
            )}
          </View>

          {members === null && !failed && (
            <View style={styles.center}>
              <ActivityIndicator color="#22c55e" />
            </View>
          )}

          {failed && (
            <View style={styles.center}>
              <Text style={styles.emptyText}>Could not load your team.</Text>
              <Pressable style={styles.retry} onPress={() => void load()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {members !== null && !failed && candidates.length === 0 && (
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                No teammates in your org yet.
              </Text>
            </View>
          )}

          {members !== null && !failed && candidates.length > 0 && (
            <FlatList
              data={candidates}
              keyExtractor={(item) => item.userId}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const checked = picked.has(item.userId);
                return (
                  <Pressable
                    style={[styles.row, item.inCall && styles.rowDisabled]}
                    disabled={item.inCall}
                    onPress={() => toggle(item.userId)}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked,
                      disabled: item.inCall,
                    }}
                    accessibilityLabel={
                      item.inCall
                        ? `${item.name} is already in voice`
                        : `Ping ${item.name}`
                    }
                  >
                    <ChannelAvatar
                      uri={item.avatarUrl}
                      size={34}
                      fallback={(item.name[0] ?? '?').toUpperCase()}
                      previewable={false}
                    />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.inCall && (
                        <Text style={styles.rowHint}>Already in voice</Text>
                      )}
                    </View>
                    {item.inCall ? (
                      <AppIcon name="headset" size={18} color="#22c55e" />
                    ) : (
                      <View
                        style={[styles.check, checked && styles.checkOn]}
                      >
                        {checked && (
                          <AppIcon name="checkmark" size={14} color="#0a0a0c" />
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            style={[
              styles.sendBtn,
              (picked.size === 0 || sending) && styles.sendBtnOff,
            ]}
            onPress={() => void send()}
            disabled={picked.size === 0 || sending}
            accessibilityRole="button"
            accessibilityLabel="Send ping"
          >
            {sending ? (
              <ActivityIndicator color="#0a0a0c" />
            ) : (
              <Text style={styles.sendText}>
                {picked.size === 0
                  ? 'Pick who to ping'
                  : `Ping ${picked.size} ${picked.size === 1 ? 'teammate' : 'teammates'}`}
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#16171b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '80%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  subtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12.5,
    marginTop: 2,
  },
  selectAll: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '800',
    paddingTop: 2,
  },
  list: { marginTop: 4 },
  center: { paddingVertical: 32, alignItems: 'center', gap: 12 },
  emptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  rowDisabled: { opacity: 0.55 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11.5,
    marginTop: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  sendBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  sendText: { color: '#0a0a0c', fontSize: 15, fontWeight: '800' },
});
