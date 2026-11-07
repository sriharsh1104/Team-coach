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
    bubbleMine: '#c9ccd1',
    bubbleTheirs: 'rgba(255,255,255,0.08)',
    watermarkOpacity: 0.12,
    statusBar: 'light',
  },
  white: {
    bg: '#f4f4f7',
    surface: 'rgba(0,0,0,0.04)',
    border: '#d4d6dc',
    text: '#16171c',
    textMuted: '#5c616b',
    textDim: '#7a808c',
    chrome: '#2a2d36',
    chromeInk: '#f4f4f7',
    link: '#4a55c7',
    danger: '#dc2626',
    bubbleMine: '#2a2d36',
    bubbleTheirs: 'rgba(0,0,0,0.06)',
    watermarkOpacity: 0.07,
    statusBar: 'dark',
  },
  lavender: {
    bg: '#ebe4f5',
    surface: 'rgba(70,40,120,0.07)',
    border: '#c9bdd9',
    text: '#1f1830',
    textMuted: '#5e5474',
    textDim: '#7a7090',
    chrome: '#5b4a82',
    chromeInk: '#f6f1fc',
    link: '#5b4a82',
    danger: '#c0392b',
    bubbleMine: '#5b4a82',
    bubbleTheirs: 'rgba(70,40,120,0.1)',
    watermarkOpacity: 0.09,
    statusBar: 'dark',
  },
};

/** Mutable current theme — StyleSheet.create reads these getters at create time
 * for modules loaded after ThemeProvider hydrates; prefer useTheme() for live UI. */
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
