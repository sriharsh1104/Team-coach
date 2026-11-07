import { Platform } from 'react-native';

const KEY = 'team-coach.customStickers';

export type CustomSticker = {
  id: string;
  /** Local file URI used when sending. */
  uri: string;
  fileName: string;
  mimeType: string;
  addedAt: string;
};

function nativeSecureStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(KEY);
  return nativeSecureStore().getItemAsync(KEY);
}

async function writeRaw(value: string | null) {
  if (Platform.OS === 'web') {
    if (value == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
    return;
  }
  const SecureStore = nativeSecureStore();
  if (value == null) await SecureStore.deleteItemAsync(KEY);
  else await SecureStore.setItemAsync(KEY, value);
}

export async function loadCustomStickers(): Promise<CustomSticker[]> {
  try {
    const raw = await readRaw();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomSticker[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCustomStickers(stickers: CustomSticker[]) {
  await writeRaw(JSON.stringify(stickers));
}

export async function addCustomSticker(
  sticker: Omit<CustomSticker, 'id' | 'addedAt'>,
): Promise<CustomSticker[]> {
  const next: CustomSticker = {
    ...sticker,
    id: `stk:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    addedAt: new Date().toISOString(),
  };
  const prev = await loadCustomStickers();
  const list = [next, ...prev].slice(0, 48);
  await saveCustomStickers(list);
  return list;
}

export async function removeCustomSticker(id: string): Promise<CustomSticker[]> {
  const prev = await loadCustomStickers();
  const list = prev.filter((s) => s.id !== id);
  await saveCustomStickers(list);
  return list;
}

/** Built-in sticker pack — sent as large single-emoji messages. */
export const BUILTIN_STICKERS = [
  '🔥', '💪', '🏆', '🎯', '😎', '🤝', '⚡', '🎮',
  '❤️', '💯', '🚀', '👏', '🙌', '💀', '🥲', '🫡',
  '🥳', '😤', '👀', '✅', '⭐', '🥇', '💥', '🛡️',
];
