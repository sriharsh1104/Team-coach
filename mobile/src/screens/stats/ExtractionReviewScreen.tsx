import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as statsApi from '../../api/stats';
import * as orgApi from '../../api/org';
import { resolveMediaUrl } from '../../api/client';
import { ExtractionRow, OrgMember, StatExtraction } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { confirmAsync } from '../../ui/confirmAsync';
import { sharedStyles } from '../shared';

const POLL_INTERVAL_MS = 3000;

type Props = NativeStackScreenProps<MainStackParamList, 'ExtractionReview'>;

function normalizeIgn(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[~·•._\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function matchMemberId(rawName: string, members: OrgMember[]): string | null {
  const key = normalizeIgn(rawName);
  if (!key) return null;
  const byIgn = members.find(
    (m) => m.inGameName && normalizeIgn(m.inGameName) === key,
  );
  if (byIgn) return byIgn.userId;
  const byName = members.find((m) => normalizeIgn(m.name) === key);
  return byName?.userId ?? null;
}

export function ExtractionReviewScreen({ navigation, route }: Props) {
  const [extraction, setExtraction] = useState<StatExtraction>(route.params.extraction);
  const [rows, setRows] = useState<ExtractionRow[]>(extraction.rows);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const stillProcessing = extraction.status === 'QUEUED' || extraction.status === 'PROCESSING';

  // OCR hasn't finished yet — poll until it flips to PENDING (ready to
  // review) or FAILED (shows a retry/discard option below instead).
  useEffect(() => {
    if (!stillProcessing) return;
    const timer = setInterval(async () => {
      const latest = await statsApi.getExtraction(extraction.id);
      setExtraction(latest);
      if (latest.status === 'PENDING') setRows(latest.rows);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [stillProcessing, extraction.id]);

  useEffect(() => {
    if (extraction.status !== 'PENDING') return;
    orgApi.getMyOrg().then((org) => {
      setMembers(org.members);
      // Re-match when members (with inGameName) load — fixes cases where OCR
      // ran before IGN was visible on the client.
      setRows((prev) =>
        prev.map((row) =>
          row.matchedUserId
            ? row
            : {
                ...row,
                matchedUserId: matchMemberId(row.rawName, org.members),
              },
        ),
      );
    });
  }, [extraction.status]);

  const onRetry = async () => {
    setIsRetrying(true);
    try {
      const updated = await statsApi.retryExtraction(extraction.id);
      setExtraction(updated);
    } catch (err: any) {
      Alert.alert('Could not retry', err?.response?.data?.message?.toString() ?? '');
    } finally {
      setIsRetrying(false);
    }
  };

  const onDiscardFailed = async () => {
    await statsApi.rejectExtraction(extraction.id);
    navigation.goBack();
  };

  const updateRow = (index: number, patch: Partial<ExtractionRow>) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        if (patch.rawName !== undefined && patch.matchedUserId === undefined) {
          next.matchedUserId = matchMemberId(patch.rawName, members);
        }
        return next;
      }),
    );
  };

  const teammateRows = useMemo(
    () => rows.filter((r) => r.matchedUserId),
    [rows],
  );
  const outsiderRows = useMemo(
    () => rows.filter((r) => !r.matchedUserId),
    [rows],
  );

  const onConfirm = async () => {
    if (teammateRows.length === 0) {
      Alert.alert(
        'No Teammates Matched',
        'Match your IGN (e.g. SES-SRI) to your profile via In-Game Name, or tap a teammate chip. Only org teammates are saved.',
      );
      return;
    }

    setIsSaving(true);
    try {
      // Persist only teammate rows — outsiders are dropped before confirm.
      await statsApi.updateExtractionRows(extraction.id, teammateRows);
      const result = await statsApi.confirmExtraction(extraction.id);
      Alert.alert(
        'Teammate Stats Saved',
        `${result.confirmedRows} teammate(s) updated${
          outsiderRows.length > 0
            ? `. ${outsiderRows.length} non-team name(s) ignored.`
            : '.'
        }`,
      );
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Could not save', err?.response?.data?.message?.toString() ?? '');
    } finally {
      setIsSaving(false);
    }
  };

  const onReject = async () => {
    const confirmed = await confirmAsync(
      'Discard this extraction?',
      'No stats will be saved.',
      'Discard',
    );
    if (!confirmed) return;
    try {
      await statsApi.rejectExtraction(extraction.id);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(
        'Could not discard',
        err?.response?.data?.message?.toString() ?? 'Please try again.',
      );
    }
  };

  const renderRow = (row: ExtractionRow, index: number, willSave: boolean) => (
    <View
      key={`${row.rawName}-${index}`}
      style={[styles.card, !willSave && styles.cardSkipped]}
    >
      {!willSave && (
        <Text style={styles.skipBadge}>Not On Team · Won't Save</Text>
      )}
      {willSave && <Text style={styles.saveBadge}>Teammate · Will Save</Text>}
      <TextInput
        style={sharedStyles.input}
        value={row.rawName}
        onChangeText={(text) => updateRow(index, { rawName: text })}
        placeholder="Name as read from screenshot"
      />
      <Text style={styles.label}>Match to teammate:</Text>
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, !row.matchedUserId && styles.chipActive]}
          onPress={() => updateRow(index, { matchedUserId: null })}
        >
          <Text style={!row.matchedUserId ? styles.chipTextActive : styles.chipText}>
            No match
          </Text>
        </Pressable>
        {members.map((m) => (
          <Pressable
            key={m.userId}
            style={[styles.chip, row.matchedUserId === m.userId && styles.chipActive]}
            onPress={() => updateRow(index, { matchedUserId: m.userId })}
          >
            <Text
              style={
                row.matchedUserId === m.userId
                  ? styles.chipTextActive
                  : styles.chipText
              }
            >
              {m.inGameName ? `${m.name} (${m.inGameName})` : m.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.statRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Kills (K)</Text>
          <TextInput
            style={sharedStyles.input}
            keyboardType="number-pad"
            value={String(row.kills)}
            onChangeText={(text) =>
              updateRow(index, { kills: Number(text) || 0 })
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Assists (A)</Text>
          <TextInput
            style={sharedStyles.input}
            keyboardType="number-pad"
            value={String(row.assists)}
            onChangeText={(text) =>
              updateRow(index, { assists: Number(text) || 0 })
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Damage</Text>
          <TextInput
            style={sharedStyles.input}
            keyboardType="number-pad"
            value={String(row.damage)}
            onChangeText={(text) =>
              updateRow(index, { damage: Number(text) || 0 })
            }
          />
        </View>
      </View>
    </View>
  );

  if (stillProcessing) {
    return (
      <Screen>
        <View style={sharedStyles.container}>
          <ActivityIndicator color="#c9ccd1" />
          <Text style={[styles.hint, { marginTop: 16 }]}>
            Still processing this screenshot — this updates automatically
            once it's ready to review.
          </Text>
        </View>
      </Screen>
    );
  }

  if (extraction.status === 'FAILED') {
    return (
      <Screen>
        <View style={sharedStyles.container}>
          <Text style={sharedStyles.title}>Couldn't Read This Screenshot</Text>
          <Text style={styles.hint}>
            {extraction.failureReason ?? 'Something went wrong reading this screenshot.'}
          </Text>
          <Pressable
            style={[sharedStyles.button, isRetrying && sharedStyles.buttonDisabled]}
            disabled={isRetrying}
            onPress={onRetry}
          >
            <ButtonLabel icon="check">{isRetrying ? 'Retrying…' : 'Retry'}</ButtonLabel>
          </Pressable>
          <Pressable style={sharedStyles.link} onPress={onDiscardFailed}>
            <Text style={[sharedStyles.link, { color: '#dc2626' }]}>Discard</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 24 }}
      >
        <Text style={sharedStyles.title}>Review Stats</Text>
        <Text style={styles.hint}>
          Sirf apne org ke teammates save honge. Apna Free Fire IGN Profile pe
          set karo (e.g. SES-SRI) — auto-match ho jayega. Baaki names skip.
        </Text>

        {extraction.mediaUrl && (
          <Image
            source={{ uri: resolveMediaUrl(extraction.mediaUrl) ?? undefined }}
            style={styles.preview}
            resizeMode="contain"
          />
        )}

        {teammateRows.length > 0 && (
          <Text style={styles.sectionHeader}>
            Will Save ({teammateRows.length})
          </Text>
        )}
        {rows.map((row, index) =>
          row.matchedUserId ? renderRow(row, index, true) : null,
        )}

        {outsiderRows.length > 0 && (
          <Text style={styles.sectionHeader}>
            Not On Team — Skipped ({outsiderRows.length})
          </Text>
        )}
        {rows.map((row, index) =>
          !row.matchedUserId ? renderRow(row, index, false) : null,
        )}

        <Pressable
          style={[
            sharedStyles.button,
            (isSaving || teammateRows.length === 0) && sharedStyles.buttonDisabled,
          ]}
          disabled={isSaving || teammateRows.length === 0}
          onPress={onConfirm}
        >
          <ButtonLabel icon="check">
            {isSaving
              ? 'Saving…'
              : `Confirm & Save ${teammateRows.length} Teammate(s)`}
          </ButtonLabel>
        </Pressable>
        <Pressable style={sharedStyles.link} onPress={onReject}>
          <Text style={[sharedStyles.link, { color: '#dc2626' }]}>
            Discard This Extraction
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: '#9aa0a6',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 13,
  },
  sectionHeader: {
    color: '#e8eaed',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 4,
  },
  preview: {
    width: '100%',
    height: 220,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  card: {
    borderWidth: 1,
    borderColor: '#3a3d44',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  cardSkipped: { opacity: 0.55, borderStyle: 'dashed' },
  saveBadge: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  skipBadge: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  label: { color: '#9aa0a6', fontSize: 12, marginBottom: 6, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipActive: { backgroundColor: '#c9ccd1', borderColor: '#c9ccd1' },
  chipText: { color: '#f2f3f5', fontSize: 13 },
  chipTextActive: { color: '#0a0a0c', fontSize: 13 },
  statRow: { flexDirection: 'row', gap: 8 },
});
