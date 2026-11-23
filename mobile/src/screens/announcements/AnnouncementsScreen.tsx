import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import * as api from '../../api/announcements';
import { Announcement } from '../../api/announcements';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { SkeletonList } from '../../ui/Skeleton';
import { SoftPressable } from '../../ui/SoftPressable';
import { confirmAsync } from '../../ui/confirmAsync';
import { emitToast } from '../../ui/toastBus';
import { usePullToRefresh } from '../../ui/usePullToRefresh';
import { useSharedStyles } from '../shared';
import { announcementsRead } from './announcementsBus';

const PAGE_SIZE = 20;
const TITLE_MAX = 120;
const BODY_MAX = 4000;

/**
 * Guild announcements. Everyone in the org reads; only the owner sees the
 * composer — and the server enforces that independently, so hiding the form
 * is presentation, not security.
 */
export function AnnouncementsScreen() {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(announcementStyles);

  const [list, setList] = useState<api.AnnouncementList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /**
   * Which posts were unread when this visit started. Opening the screen marks
   * everything read a moment later, so reading "new" off the server would
   * make the markers vanish while the person is still looking at them.
   */
  const newIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await api.listAnnouncements({ take: PAGE_SIZE });
      for (const a of data.announcements) if (!a.read) newIds.current.add(a.id);
      setList(data);
      setFailed(false);
      setError(null);

      if (data.unread > 0) {
        await api.markAllRead().catch(() => undefined);
        // Clears the drawer badge without waiting for a re-open.
        announcementsRead();
      }
    } catch (err: any) {
      setList(null);
      setFailed(true);
      setError(
        err?.response?.status === 404
          ? 'Join a guild to see its announcements.'
          : apiErrorMessage(err, 'Could not load announcements'),
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshControl = usePullToRefresh(load);

  return (
    <Screen>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={list?.announcements ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Text style={shared.title}>Announcements</Text>
            <Text style={styles.hint}>
              Posts from your guild owner. Everyone in the guild gets a
              notification.
            </Text>
            {error ? <Text style={shared.error}>{error}</Text> : null}
            {list?.canPost ? (
              <Composer styles={styles} colors={colors} onPosted={load} />
            ) : null}
            {!list && !failed ? <SkeletonList count={3} avatar={false} /> : null}
          </View>
        }
        ListEmptyComponent={
          // `failed` first: a failed load also clears `list`, so checking
          // that first would swallow the retry and leave only an error line
          // with nothing to tap.
          failed ? (
            <SoftPressable
              style={styles.retry}
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Try loading again"
            >
              <Text style={styles.retryText}>Could not load. Tap to retry.</Text>
            </SoftPressable>
          ) : !list ? null : (
            <Text style={styles.empty}>
              {list.canPost
                ? 'Nothing posted yet. Your first announcement will reach every member.'
                : 'Your guild owner has not posted anything yet.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <AnnouncementCard
            announcement={item}
            isNew={newIds.current.has(item.id)}
            canDelete={!!list?.canPost}
            styles={styles}
            onDeleted={load}
          />
        )}
      />
    </Screen>
  );
}

function Composer({
  styles,
  colors,
  onPosted,
}: {
  styles: ReturnType<typeof announcementStyles>;
  colors: ThemeColors;
  onPosted: () => Promise<void> | void;
}) {
  const shared = useSharedStyles();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <View style={styles.composer}>
      <TextInput
        style={shared.input}
        placeholder="Title — e.g. Scrim tonight at 9"
        placeholderTextColor={colors.textDim}
        value={title}
        maxLength={TITLE_MAX}
        onChangeText={setTitle}
        accessibilityLabel="Announcement title"
      />
      <TextInput
        style={[shared.input, styles.composerBody]}
        placeholder="What do you want everyone to know?"
        placeholderTextColor={colors.textDim}
        value={body}
        maxLength={BODY_MAX}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Announcement message"
      />
      {/* Said plainly before the tap, not after — this pushes to every
          member's phone and cannot be unsent. */}
      <Text style={styles.composerNote}>
        Sends a notification to every member of your guild.
      </Text>
      <SoftPressable
        style={[shared.button, !canSend && styles.buttonDisabled]}
        disabled={!canSend}
        onPress={async () => {
          setSending(true);
          try {
            await api.createAnnouncement({
              title: title.trim(),
              body: body.trim(),
            });
            setTitle('');
            setBody('');
            emitToast('Sent to everyone in your guild');
            await onPosted();
          } catch (err) {
            emitToast(apiErrorMessage(err, 'Could not send that announcement'));
          } finally {
            setSending(false);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="Send announcement to everyone"
      >
        {sending ? (
          <ActivityIndicator color={colors.chromeInk} size="small" />
        ) : (
          <ButtonLabel icon="send">Send to everyone</ButtonLabel>
        )}
      </SoftPressable>
    </View>
  );
}

function AnnouncementCard({
  announcement,
  isNew,
  canDelete,
  styles,
  onDeleted,
}: {
  announcement: Announcement;
  isNew: boolean;
  canDelete: boolean;
  styles: ReturnType<typeof announcementStyles>;
  onDeleted: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <View style={[styles.card, isNew && styles.cardUnread]}>
      <View style={styles.cardHead}>
        <View style={styles.cardHeadMain}>
          <Text style={styles.cardTitle}>{announcement.title}</Text>
          <Text style={styles.cardMeta}>
            {announcement.author?.name ?? 'Former owner'} ·{' '}
            {formatWhen(announcement.createdAt)}
          </Text>
        </View>
        {isNew ? (
          <View style={styles.newPill}>
            <Text style={styles.newPillText}>New</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardBody}>{announcement.body}</Text>
      {canDelete ? (
        <SoftPressable
          style={styles.remove}
          disabled={busy}
          onPress={async () => {
            // Already delivered to every phone — deleting only clears the
            // in-app record, so say that rather than implying a recall.
            const ok = await confirmAsync(
              'Remove announcement?',
              'Notifications already sent cannot be taken back. This only removes it from the list.',
              'Remove',
            );
            if (!ok) return;
            setBusy(true);
            try {
              await api.deleteAnnouncement(announcement.id);
              await onDeleted();
            } catch (err) {
              emitToast(apiErrorMessage(err, 'Could not remove that'));
            } finally {
              setBusy(false);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove announcement ${announcement.title}`}
        >
          <Text style={styles.removeText}>{busy ? '…' : 'Remove'}</Text>
        </SoftPressable>
      ) : null}
    </View>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function announcementStyles(c: ThemeColors) {
  return {
    list: { flex: 1, backgroundColor: 'transparent' },
    content: { padding: 24, paddingBottom: 40 },
    hint: {
      color: c.textMuted,
      fontSize: 13,
      textAlign: 'center' as const,
      marginTop: -12,
      marginBottom: 20,
    },
    empty: { color: c.textMuted, fontSize: 13, textAlign: 'center' as const },

    composer: { gap: 10, marginBottom: 22 },
    composerBody: { minHeight: 96, paddingTop: 12 },
    composerNote: { color: c.textMuted, fontSize: 12 },
    buttonDisabled: { opacity: 0.5 },

    card: {
      padding: 14,
      marginBottom: 10,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Unread gets a left edge rather than a different fill — it still has to
    // be readable once the screen marks everything read a moment later.
    cardUnread: { borderLeftWidth: 3, borderLeftColor: c.chrome },
    cardHead: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: 10,
      marginBottom: 6,
    },
    cardHeadMain: { flex: 1, minWidth: 0 },
    cardTitle: { color: c.text, fontSize: 15, fontWeight: '700' as const },
    cardMeta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    cardBody: { color: c.text, fontSize: 14, lineHeight: 21 },
    newPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: c.chrome,
    },
    newPillText: {
      color: c.chromeInk,
      fontSize: 11,
      fontWeight: '800' as const,
    },
    remove: { alignSelf: 'flex-start' as const, marginTop: 10 },
    removeText: {
      color: c.danger,
      fontSize: 12,
      fontWeight: '700' as const,
    } as TextStyle,

    retry: {
      alignItems: 'center' as const,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
    },
    retryText: { color: c.danger, fontSize: 13, fontWeight: '600' as const },
  };
}
