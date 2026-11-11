/** Sacred eSports platform palette — used by auth + in-app screens alike. */

export type ThemeId = 'black' | 'white' | 'lavender';

export type ThemeColors = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  textDim: string;
  chrome: string;
  chromeInk: string;
  link: string;
  danger: string;
  bubbleMine: string;
  bubbleTheirs: string;
  /** Text color INSIDE sent (mine) bubbles — separate from chromeInk so dark-theme bubbles get light text. */
  bubbleTextMine: string;
  /** High-contrast icon/action color on bg (always readable). */
  icon: string;
  watermarkOpacity: number;
  statusBar: 'light' | 'dark';
};

export const THEME_OPTIONS: Array<{
  id: ThemeId;
  label: string;
  swatch: string;
}> = [
  { id: 'black', label: 'Black', swatch: '#0a0a0c' },
  { id: 'white', label: 'White', swatch: '#f4f4f7' },
  { id: 'lavender', label: 'Lavender', swatch: '#ebe4f5' },
];

const PALETTES: Record<ThemeId, ThemeColors> = {
  black: {
    bg: '#0a0a0c',
    surface: 'rgba(255,255,255,0.06)',
    border: '#3a3d44',
    text: '#f2f3f5',
    textMuted: '#9aa0a6',
    textDim: '#8b8f97',
    chrome: '#c9ccd1',
    chromeInk: '#0a0a0c',
    link: '#a8b0ff',
    danger: '#f87171',
    // Dark-theme chat: sent = dark navy, received = dark charcoal — both
    // clearly visible on the near-black bg with near-white text on each side.
    bubbleMine: '#1b3050',
    bubbleTheirs: '#1e2124',
    bubbleTextMine: '#e8ecf0',
    icon: '#f2f3f5',
    watermarkOpacity: 0.18,
    statusBar: 'light',
  },
  white: {
    bg: '#f4f4f7',
    surface: 'rgba(0,0,0,0.05)',
    border: '#d0d3da',
    text: '#16171c',
    textMuted: '#5c616b',
    textDim: '#7a808c',
    chrome: '#2a2d36',
    chromeInk: '#f4f4f7',
    link: '#4a55c7',
    danger: '#dc2626',
    bubbleMine: '#2a2d36',
    bubbleTheirs: 'rgba(0,0,0,0.07)',
    bubbleTextMine: '#f4f4f7',
    icon: '#16171c',
    watermarkOpacity: 0.22,
    statusBar: 'dark',
  },
  lavender: {
    bg: '#ebe4f5',
    surface: 'rgba(70,40,120,0.08)',
    border: '#c9bdd9',
    text: '#1f1830',
    textMuted: '#5e5474',
    textDim: '#7a7090',
    chrome: '#5b4a82',
    chromeInk: '#f6f1fc',
    link: '#5b4a82',
    danger: '#c0392b',
    bubbleMine: '#5b4a82',
    bubbleTheirs: 'rgba(70,40,120,0.12)',
    bubbleTextMine: '#f6f1fc',
    icon: '#1f1830',
    watermarkOpacity: 0.2,
    statusBar: 'dark',
  },
};

/** Mutable current theme — prefer useTheme() for live UI (StyleSheet.create freezes values). */
let currentId: ThemeId = 'black';

export function getThemeId(): ThemeId {
  return currentId;
}

export function setThemeId(id: ThemeId) {
  currentId = id;
}

export function getThemeColors(id: ThemeId = currentId): ThemeColors {
  return PALETTES[id] ?? PALETTES.black;
}

/** Backward-compatible static export — tracks current theme via getters. */
export const colors: ThemeColors = new Proxy({} as ThemeColors, {
  get(_target, prop: keyof ThemeColors) {
    return getThemeColors()[prop];
  },
});
