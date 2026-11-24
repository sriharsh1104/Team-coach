import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ResizeMode, Video } from 'expo-av';
import * as chatApi from '../../api/chat';
import { ChatMessage } from '../../api/types';
import { ThemeColors } from '../../theme';
import { AppIcon } from '../../ui/AppIcon';
import { ParsedSummary, parsePointsSummary } from '../../data/pointsCalculator';
import { ChannelAvatar } from './ChannelAvatar';
import { ChatStyles } from './chatStyles';
import { LinkPreviewCard } from './LinkPreviewCard';
import { MessageReactionPills } from './MessageReactionPills';
import { MessageText } from './MessageText';
import { formatMessageTime, formatSenderLabel } from './messageFormat';
import { PendingMediaOverlay } from './PendingMediaOverlay';
import { PendingUpload } from './pendingUpload';
import { VoiceNoteBubble } from './VoiceNoteBubble';

type Props = {
  message: ChatMessage;
  /** Themed sheet from the screen — stable per theme, so memo still holds. */
  styles: ChatStyles;
  colors: ThemeColors;
  isMine: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  selectMode: boolean;
  /** Set while this bubble's media is still uploading. */
  pending?: PendingUpload;
  /** Cancel an upload that is still in flight (the ✕ on the progress ring). */
  onCancelPending?: (message: ChatMessage) => void;
  avatarUri?: string | null;
  knownIgns: string[];
  /** Only the newest of my messages carries the delivery/seen ticks. */
  showSeen: boolean;
  tickState: 'sent' | 'delivered' | 'seen';
  tickLabel: string;
  /** This bubble is the latest points table, so it offers "Add match". */
  showAddMatch: boolean;
  onPress: (message: ChatMessage) => void;
  onLongPress: (message: ChatMessage) => void;
  onOpenMedia: (media: { type: 'IMAGE' | 'VIDEO'; uri: string }) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onShowInfo: (messageId: string) => void;
  onAddMatch: (parsed: ParsedSummary) => void;
};

/**
 * One chat bubble.
 *
 * Extracted from ChatScreen's inline `renderItem` and memoized: that closure
 * was rebuilt on every keystroke in the composer, so every mounted bubble
 * re-rendered while typing. Everything it needs now arrives as a prop, and
 * each one is either a primitive or a value the screen already memoizes.
 */
function MessageBubbleInner({
  message,
  styles,
  colors,
  isMine,
  isSelected,
  isHighlighted,
  selectMode,
  pending,
  onCancelPending,
  avatarUri,
  knownIgns,
  showSeen,
  tickState,
  tickLabel,
  showAddMatch,
  onPress,
  onLongPress,
  onOpenMedia,
  onToggleReaction,
  onShowInfo,
  onAddMatch,
}: Props) {
  const isDeleted = !!(message.deleted || message.deletedAt);
  const mediaUri = isDeleted
    ? null
    : chatApi.resolveChatMediaUrl(message.mediaUrl);
  const mediaOnly =
    !isDeleted &&
    (message.mediaType === 'IMAGE' || message.mediaType === 'VIDEO') &&
    !message.text?.trim() &&
    !message.replyTo &&
    !message.forwarded;
  // Multi-select checkboxes are for your own messages (delete batch).
  // A single peer message can still be selected via long-press for reply/star,
  // and shows a check while it is the active selection.
  const canSelect =
    selectMode && !isDeleted && (isMine || isSelected);
  return (
      <Pressable
        onPress={() => onPress(message)}
        onLongPress={() => onLongPress(message)}
        delayLongPress={350}
        style={[
          styles.bubbleRow,
          isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
          isSelected && styles.bubbleRowSelected,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={
          isDeleted
            ? 'Deleted message'
            : isMine
              ? 'Your message'
              : `Message from ${message.senderName}`
        }
      >
        {!isMine ? (
          <View style={styles.bubbleAvatar}>
            <ChannelAvatar
              uri={avatarUri}
              size={28}
              fallback={(message.senderName[0] ?? '?').toUpperCase()}
              previewable={false}
            />
          </View>
        ) : null}
        {canSelect ? (
          <View
            style={[
              styles.selectCheck,
              isSelected && styles.selectCheckOn,
            ]}
          >
            {isSelected ? (
              <Text style={styles.selectCheckMark}>✓</Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.bubbleCol}>
          {mediaOnly ? (
            <Text style={styles.sender}>{formatSenderLabel(message)}</Text>
          ) : null}
          <View
            style={[
              styles.bubble,
              isMine && styles.bubbleMine,
              mediaOnly && styles.bubbleMediaOnly,
              isHighlighted && styles.bubbleHit,
              isSelected && styles.bubbleSelected,
            ]}
          >
            {!mediaOnly && !isDeleted ? (
              <Text style={styles.sender}>{formatSenderLabel(message)}</Text>
            ) : null}
            {isDeleted ? (
              <Text
                style={[
                  styles.deletedLabel,
                  isMine && styles.deletedLabelMine,
                ]}
              >
                This message has been deleted
              </Text>
            ) : null}
            {!isDeleted && message.forwarded ? (
              <Text style={[styles.forwardedLabel, isMine && styles.forwardedLabelMine]}>
                ↪ Forwarded
              </Text>
            ) : null}
            {!isDeleted && message.replyTo ? (
              <View
                style={[
                  styles.replyQuote,
                  isMine && styles.replyQuoteMine,
                ]}
              >
                <Text
                  style={[
                    styles.replyQuoteName,
                    isMine && styles.replyQuoteNameMine,
                  ]}
                  numberOfLines={1}
                >
                  {message.replyTo.senderName}
                </Text>
                <Text
                  style={[
                    styles.replyQuoteText,
                    isMine && styles.replyQuoteTextMine,
                  ]}
                  numberOfLines={2}
                >
                  {message.replyTo.deleted
                    ? 'This message has been deleted'
                    : message.replyTo.text?.trim() ||
                      (message.replyTo.mediaType === 'VIDEO'
                        ? 'Video'
                        : 'Photo')}
                </Text>
              </View>
            ) : null}
            {message.mediaType === 'IMAGE' && mediaUri ? (
              <Pressable
                onPress={() => {
                  if (pending || selectMode) {
                    onPress(message);
                    return;
                  }
                  onOpenMedia({ type: 'IMAGE', uri: mediaUri });
                }}
                accessibilityLabel={
                  pending?.status === 'failed'
                    ? 'Upload failed, tap to try again'
                    : pending
                      ? 'Image upload in progress'
                      : 'View image'
                }
              >
                <Image
                  source={{ uri: mediaUri }}
                  style={mediaOnly ? styles.mediaFlush : styles.media}
                  contentFit="cover"
                  // Disk cache: first open hits the URL; later opens
                  // (and other chats reusing the same file) read cache.
                  // Pending bubbles use file:/content: URIs — shown
                  // straight from the device, never re-downloaded.
                  cachePolicy="memory-disk"
                  recyclingKey={message.id}
                  // Dark placeholder so a failed CDN/proxy load is
                  // obvious instead of looking like a missing bubble.
                  placeholder={{ color: 'rgba(255,255,255,0.08)' }}
                  transition={pending ? 0 : 200}
                />
                {pending ? (
                  <PendingMediaOverlay
                    status={pending.status}
                    progress={pending.progress}
                    label={pending.label}
                    onCancel={
                      onCancelPending
                        ? () => onCancelPending(message)
                        : undefined
                    }
                  />
                ) : null}
              </Pressable>
            ) : null}
            {message.mediaType === 'VIDEO' && mediaUri ? (
              <Pressable
                style={mediaOnly ? styles.videoThumbFlush : styles.videoThumb}
                onPress={() => {
                  if (pending || selectMode) {
                    onPress(message);
                    return;
                  }
                  onOpenMedia({ type: 'VIDEO', uri: mediaUri });
                }}
                accessibilityLabel={
                  pending?.status === 'failed'
                    ? 'Upload failed, tap to try again'
                    : pending
                      ? 'Video upload in progress'
                      : 'Play video'
                }
              >
                {pending ? (
                  // First frame of the picked video as the thumbnail
                  // while it uploads (paused, muted, no controls).
                  <Video
                    source={{ uri: mediaUri }}
                    style={mediaOnly ? styles.videoFrameFlush : styles.videoFrame}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={false}
                    isMuted
                    useNativeControls={false}
                  />
                ) : (
                  <Text style={styles.playIcon}>▶</Text>
                )}
                {pending ? (
                  <PendingMediaOverlay
                    status={pending.status}
                    progress={pending.progress}
                    label={pending.label}
                    onCancel={
                      onCancelPending
                        ? () => onCancelPending(message)
                        : undefined
                    }
                  />
                ) : null}
              </Pressable>
            ) : null}
            {message.mediaType === 'AUDIO' && mediaUri ? (
              pending ? (
                <View style={styles.voiceUploading}>
                  <ActivityIndicator
                    color={isMine ? colors.chromeInk : colors.chrome}
                    size="small"
                  />
                  <Text
                    style={[
                      styles.voiceUploadingText,
                      isMine && styles.voiceUploadingTextMine,
                    ]}
                  >
                    {pending.label ?? 'Uploading…'}
                  </Text>
                </View>
              ) : (
                <VoiceNoteBubble uri={mediaUri} isMine={isMine} />
              )
            ) : null}
            {message.text ? (
              <MessageText
                text={message.text}
                knownIgns={knownIgns}
                mine={isMine}
              />
            ) : null}
            {!message.mediaType && message.text && !pending
              ? (() => {
                  const url = chatApi.extractFirstUrl(message.text);
                  return url ? <LinkPreviewCard url={url} isMine={isMine} /> : null;
                })()
              : null}
            {showAddMatch && !selectMode && !pending
              ? (() => {
                  const parsed = parsePointsSummary(message.text);
                  if (!parsed) return null;
                  return (
                    <Pressable
                      style={[styles.addMatchBtn, isMine && styles.addMatchBtnMine]}
                      onPress={() => onAddMatch(parsed)}
                      accessibilityRole="button"
                      accessibilityLabel="Add next match to this points table"
                    >
                      <AppIcon
                        name="add-circle-outline"
                        size={16}
                        color={isMine ? colors.chromeInk : colors.link}
                      />
                      <Text style={[styles.addMatchText, isMine && styles.addMatchTextMine]}>
                        Add match {parsed.matches.length + 1}
                      </Text>
                    </Pressable>
                  );
                })()
              : null}
            {!isDeleted && !selectMode ? (
              <MessageReactionPills
                reactions={message.reactions ?? []}
                onToggle={(emoji) => onToggleReaction(message.id, emoji)}
              />
            ) : null}
            <View
              style={[styles.metaRow, mediaOnly && styles.metaRowOnMedia]}
            >
              {message.pinned ? (
                <AppIcon
                  name="pin"
                  size={12}
                  color={
                    mediaOnly
                      ? '#fff'
                      : isMine
                        ? colors.chromeInk
                        : colors.textDim
                  }
                />
              ) : null}
              {message.starred ? (
                <AppIcon
                  name="star"
                  size={12}
                  color={
                    mediaOnly
                      ? '#fff'
                      : isMine
                        ? colors.chromeInk
                        : colors.textDim
                  }
                />
              ) : null}
              {message.editedAt ? (
                <Text
                  style={[
                    styles.editedLabel,
                    isMine && styles.editedLabelMine,
                    mediaOnly && styles.timeLabelOnMedia,
                  ]}
                >
                  edited
                </Text>
              ) : null}
              <Text
                style={[
                  styles.timeLabel,
                  isMine && styles.timeLabelMine,
                  mediaOnly && styles.timeLabelOnMedia,
                ]}
                accessibilityLabel={`Sent at ${formatMessageTime(message.createdAt)}`}
              >
                {formatMessageTime(message.createdAt)}
              </Text>
            </View>
          </View>
          {showSeen && !selectMode && (
            <Pressable
              onLongPress={() => onShowInfo(message.id)}
              delayLongPress={350}
              style={styles.seenRow}
              accessibilityLabel={tickLabel}
            >
              <Text
                style={[
                  styles.tick,
                  tickState === 'seen' && styles.tickSeen,
                ]}
              >
                {tickState === 'sent' ? '✓' : '✓✓'}
              </Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    );
}

export const MessageBubble = React.memo(MessageBubbleInner);
