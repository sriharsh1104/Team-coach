import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeContext';
import { emitToast } from '../../ui/toastBus';
import { MUSIC_MAX_BYTES } from '../../voice/musicShare';

export type MusicPickResult = {
  title: string;
  mime: string;
  uri: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (pick: MusicPickResult) => void;
};

type Row = {
  id: string;
  title: string;
  durationMs: number;
  uri: string;
  mime: string;
};

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function MusicSharePicker({ visible, onClose, onPick }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        emitToast('Allow media access to share music');
        onClose();
        return;
      }
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 80,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const mapped: Row[] = [];
      for (const asset of page.assets) {
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        const uri = info.localUri ?? info.uri;
        if (!uri) continue;
        mapped.push({
          id: asset.id,
          title: asset.filename?.replace(/\.[^.]+$/, '') || 'Track',
          durationMs: asset.duration * 1000,
          uri,
          mime: guessMime(asset.filename),
        });
      }
      setRows(mapped);
    } catch (err) {
      console.warn('music library load failed:', err);
      emitToast('Could not open your music library');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [onClose]);

  useEffect(() => {
    if (visible) void load();
    else setRows([]);
  }, [visible, load]);

  const pick = async (row: Row) => {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(row.id);
      const uri = info.localUri ?? info.uri ?? row.uri;
      // Soft size check via duration heuristic is unreliable; engine enforces 2MB.
      onPick({ title: row.title, mime: row.mime, uri });
      onClose();
    } catch {
      emitToast('Could not open that track');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Share Music</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              Plays for everyone in voice. Max {Math.round(MUSIC_MAX_BYTES / (1024 * 1024))} MB —
              nothing is saved on our servers.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <AppIcon name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.chrome} style={{ marginVertical: 32 }} />
        ) : rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No audio files found on this device.
          </Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => void pick(item)}
                accessibilityRole="button"
                accessibilityLabel={`Share ${item.title}`}
              >
                <AppIcon name="musical-notes" size={20} color={colors.chrome} />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!!item.durationMs && (
                    <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                      {formatDuration(item.durationMs)}
                    </Text>
                  )}
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

function guessMime(filename: string | null | undefined): string {
  const lower = (filename ?? '').toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac')) return 'audio/aac';
  return 'audio/mpeg';
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 13, lineHeight: 18 },
  list: { paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12 },
  empty: {
    textAlign: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    fontSize: 14,
  },
});
