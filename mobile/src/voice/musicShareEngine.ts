/**
 * Runtime for Share Music: chunked LiveKit data + local expo-av playback.
 * Cache files live under FileSystem.cacheDirectory only — never our API/DB.
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import {
  MUSIC_MAX_BYTES,
  MusicControlMsg,
  MusicShareInfo,
  musicCacheFileName,
  newMusicShareId,
} from './musicShare';

export type MusicSharePublish = (msg: MusicControlMsg) => void;

export type MusicSharePick = {
  title: string;
  mime: string;
  /** Local file URI readable by expo-file-system. */
  uri: string;
};

/** Base64 characters per data chunk (~6KB raw). */
const CHUNK_B64_CHARS = 8_000;

type IncomingBuffer = {
  title: string;
  mime: string;
  bytes: number;
  fromName: string;
  total: number;
  chunks: (string | undefined)[];
  received: number;
};

export type MusicShareEngine = {
  handleMessage: (msg: MusicControlMsg) => void;
  startLocalShare: (pick: MusicSharePick) => Promise<void>;
  stop: (broadcast?: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  dispose: () => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMusicShareEngine(opts: {
  publish: MusicSharePublish;
  onChange: (info: MusicShareInfo | null) => void;
  getLocalName: () => string;
}): MusicShareEngine {
  let info: MusicShareInfo | null = null;
  let sound: Audio.Sound | null = null;
  let cacheUri: string | null = null;
  let incoming: IncomingBuffer | null = null;
  let incomingShareId: string | null = null;
  let sendGeneration = 0;
  let disposed = false;
  let deafened = false;

  const emit = (next: MusicShareInfo | null) => {
    info = next;
    if (!disposed) opts.onChange(next);
  };

  const clearCache = async () => {
    const uri = cacheUri;
    cacheUri = null;
    if (!uri) return;
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // best-effort
    }
  };

  const unloadSound = async () => {
    const s = sound;
    sound = null;
    if (!s) return;
    try {
      await s.stopAsync();
    } catch {
      /* */
    }
    try {
      await s.unloadAsync();
    } catch {
      /* */
    }
  };

  const playFromUri = async (uri: string, atMs: number) => {
    await unloadSound();
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    const created = new Audio.Sound();
    await created.loadAsync(
      { uri },
      { shouldPlay: false, positionMillis: Math.max(0, atMs), volume: deafened ? 0 : 1 },
    );
    sound = created;
    await created.playAsync();
  };

  const finishStop = async (broadcast: boolean, shareId: string | null) => {
    sendGeneration += 1;
    incoming = null;
    incomingShareId = null;
    await unloadSound();
    await clearCache();
    if (broadcast && shareId) {
      opts.publish({ type: 'music', op: 'stop', shareId });
    }
    emit(null);
  };

  const writeIncomingFile = async (shareId: string, buf: IncomingBuffer): Promise<string> => {
    const dir = FileSystem.cacheDirectory;
    if (!dir) throw new Error('No cache directory');
    const name = musicCacheFileName(shareId, buf.mime);
    const uri = `${dir}${name}`;
    const b64 = buf.chunks.join('');
    await FileSystem.writeAsStringAsync(uri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return uri;
  };

  const handleOffer = (msg: Extract<MusicControlMsg, { op: 'offer' }>) => {
    if (info?.isLocal && (info.status === 'sending' || info.status === 'playing')) {
      return;
    }
    void unloadSound();
    void clearCache();
    if (msg.bytes <= 0 || msg.bytes > MUSIC_MAX_BYTES) return;
    if (msg.total <= 0) return;
    incomingShareId = msg.shareId;
    incoming = {
      title: msg.title,
      mime: msg.mime,
      bytes: msg.bytes,
      fromName: msg.fromName,
      total: msg.total,
      chunks: new Array(msg.total),
      received: 0,
    };
    emit({
      shareId: msg.shareId,
      title: msg.title,
      isLocal: false,
      status: 'sending',
      progress: 0,
      fromName: msg.fromName,
    });
  };

  const handleChunk = async (msg: Extract<MusicControlMsg, { op: 'chunk' }>) => {
    if (!incoming || incomingShareId !== msg.shareId) return;
    if (msg.index < 0 || msg.index >= incoming.chunks.length) return;
    if (incoming.chunks[msg.index] == null) {
      incoming.chunks[msg.index] = msg.data;
      incoming.received += 1;
    }
    const progress = incoming.received / incoming.chunks.length;
    emit({
      shareId: msg.shareId,
      title: incoming.title,
      isLocal: false,
      status: 'sending',
      progress,
      fromName: incoming.fromName,
    });
    if (incoming.received < incoming.chunks.length) return;
    try {
      const uri = await writeIncomingFile(msg.shareId, incoming);
      cacheUri = uri;
    } catch (err) {
      console.warn('music share write failed:', err);
      await finishStop(false, null);
    }
  };

  const handlePlay = async (msg: Extract<MusicControlMsg, { op: 'play' }>) => {
    if (incomingShareId !== msg.shareId && info?.shareId !== msg.shareId) return;
    if (!cacheUri) return;
    const title = info?.title ?? incoming?.title ?? 'Music';
    const fromName = info?.fromName ?? incoming?.fromName ?? 'Someone';
    try {
      await playFromUri(cacheUri, msg.atMs);
      emit({
        shareId: msg.shareId,
        title,
        isLocal: false,
        status: 'playing',
        progress: 1,
        fromName,
      });
    } catch (err) {
      console.warn('music share play failed:', err);
      await finishStop(false, null);
    }
  };

  const handleMessage = (msg: MusicControlMsg) => {
    if (disposed) return;
    switch (msg.op) {
      case 'offer':
        handleOffer(msg);
        break;
      case 'chunk':
        void handleChunk(msg);
        break;
      case 'play':
        void handlePlay(msg);
        break;
      case 'pause':
        if (info?.shareId === msg.shareId && sound) {
          void sound.pauseAsync();
          emit({ ...info, status: 'paused' });
        }
        break;
      case 'stop':
        if (info?.shareId === msg.shareId || incomingShareId === msg.shareId) {
          void finishStop(false, null);
        }
        break;
    }
  };

  const startLocalShare = async (pick: MusicSharePick) => {
    if (disposed) return;
    if (info) {
      await finishStop(true, info.shareId);
    }
    const shareId = newMusicShareId();
    const gen = ++sendGeneration;
    const fromName = opts.getLocalName() || 'You';

    let b64: string;
    try {
      b64 = await FileSystem.readAsStringAsync(pick.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (err) {
      console.warn('music share read failed:', err);
      throw new Error('Could not read that song');
    }

    const bytes = Math.floor((b64.length * 3) / 4);
    if (bytes <= 0) throw new Error('That file is empty');
    if (bytes > MUSIC_MAX_BYTES) {
      throw new Error('Song is too large (max 8 MB). Pick a shorter clip.');
    }

    const dir = FileSystem.cacheDirectory;
    if (!dir) throw new Error('No cache directory');
    const localCache = `${dir}${musicCacheFileName(shareId, pick.mime)}`;
    await FileSystem.writeAsStringAsync(localCache, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    cacheUri = localCache;

    const total = Math.ceil(b64.length / CHUNK_B64_CHARS) || 1;

    emit({
      shareId,
      title: pick.title,
      isLocal: true,
      status: 'sending',
      progress: 0,
      fromName,
    });

    opts.publish({
      type: 'music',
      op: 'offer',
      shareId,
      title: pick.title,
      mime: pick.mime,
      bytes,
      total,
      fromName,
    });

    for (let i = 0; i < total; i++) {
      if (disposed || sendGeneration !== gen) return;
      const data = b64.slice(i * CHUNK_B64_CHARS, (i + 1) * CHUNK_B64_CHARS);
      opts.publish({
        type: 'music',
        op: 'chunk',
        shareId,
        index: i,
        total,
        data,
      });
      emit({
        shareId,
        title: pick.title,
        isLocal: true,
        status: 'sending',
        progress: (i + 1) / total,
        fromName,
      });
      if (i % 4 === 3) await sleep(12);
    }

    if (disposed || sendGeneration !== gen) return;
    await sleep(350);
    if (disposed || sendGeneration !== gen) return;

    opts.publish({ type: 'music', op: 'play', shareId, atMs: 0 });
    try {
      await playFromUri(localCache, 0);
      emit({
        shareId,
        title: pick.title,
        isLocal: true,
        status: 'playing',
        progress: 1,
        fromName,
      });
    } catch (err) {
      console.warn('music share local play failed:', err);
      await finishStop(true, shareId);
      throw new Error('Could not play that song');
    }
  };

  return {
    handleMessage,
    startLocalShare,
    stop: (broadcast = true) => {
      const id = info?.shareId ?? incomingShareId;
      void finishStop(broadcast, broadcast ? id : null);
    },
    setDeafened: (next) => {
      deafened = next;
      if (sound) {
        void sound.setVolumeAsync(next ? 0 : 1);
      }
    },
    dispose: () => {
      disposed = true;
      sendGeneration += 1;
      void finishStop(false, null);
    },
  };
}
