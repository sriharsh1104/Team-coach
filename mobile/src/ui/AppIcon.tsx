import React from 'react';
import Svg, { Path, Circle, Line, Rect, G } from 'react-native-svg';

export type AppIconName =
  | 'add-circle'
  | 'add-circle-outline'
  | 'alarm-outline'
  | 'camera-outline'
  | 'cart'
  | 'checkmark'
  | 'checkmark-circle'
  | 'chevron-back'
  | 'close'
  | 'cloud-upload-outline'
  | 'copy-outline'
  | 'download-outline'
  | 'ellipsis-vertical'
  | 'eye-off-outline'
  | 'eye-outline'
  | 'flag'
  | 'flag-outline'
  | 'happy-outline'
  | 'image-outline'
  | 'images-outline'
  | 'mic'
  | 'mic-off'
  | 'notifications'
  | 'notifications-off'
  | 'person-add'
  | 'person-remove'
  | 'person-remove-outline'
  | 'phone-down'
  | 'phone-portrait-outline'
  | 'pin'
  | 'pin-outline'
  | 'search'
  | 'send'
  | 'sparkles-outline'
  | 'star'
  | 'star-outline'
  | 'stop-circle'
  | 'videocam-outline';

type Props = {
  name: AppIconName;
  size?: number;
  color?: string;
  style?: object;
};

type Renderer = (c: string, s: number) => React.ReactElement;

const ICONS: Record<AppIconName, Renderer> = {
  'chevron-back': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18L9 12l6-6" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'close': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={c} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  ),
  'ellipsis-vertical': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Circle cx="12" cy="5" r="1.5" fill={c} />
      <Circle cx="12" cy="12" r="1.5" fill={c} />
      <Circle cx="12" cy="19" r="1.5" fill={c} />
    </Svg>
  ),
  'eye-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="3" stroke={c} strokeWidth={2} />
    </Svg>
  ),
  'eye-off-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="1" y1="1" x2="23" y2="23" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'search': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="8" stroke={c} strokeWidth={2} />
      <Path d="M21 21l-4.35-4.35" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'add-circle-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={c} strokeWidth={2} />
      <Path d="M12 8v8M8 12h8" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'add-circle': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="12" fill={c} />
      <Path d="M12 7v10M7 12h10" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  ),
  'download-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'cloud-upload-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M18 15l-6-6-6 6M12 9v12" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'flag-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'image-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="18" height="18" rx="2" stroke={c} strokeWidth={2} />
      <Circle cx="8.5" cy="8.5" r="1.5" stroke={c} strokeWidth={2} />
      <Path d="M21 15l-5-5L5 21" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'images-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="6" width="16" height="14" rx="2" stroke={c} strokeWidth={2} />
      <Path d="M6 2h16a2 2 0 012 2v12" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18 14l-4-4-4 6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="8" cy="11" r="1.5" fill={c} />
    </Svg>
  ),
  'person-add': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="9" cy="7" r="4" stroke={c} strokeWidth={2} />
      <Path d="M19 8v6M22 11h-6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'person-remove': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="9" cy="7" r="4" stroke={c} strokeWidth={2} />
      <Path d="M22 11h-6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'person-remove-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="9" cy="7" r="4" stroke={c} strokeWidth={2} />
      <Path d="M22 11h-6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'stop-circle': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={c} strokeWidth={2} />
      <Rect x="9" y="9" width="6" height="6" fill={c} />
    </Svg>
  ),
  'pin': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Path d="M12 2a4.5 4.5 0 014.5 4.5c0 2.5-1.5 4.5-3 6L12 22l-1.5-9.5c-1.5-1.5-3-3.5-3-6A4.5 4.5 0 0112 2z" fill={c} />
    </Svg>
  ),
  'pin-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a4.5 4.5 0 014.5 4.5c0 2.5-1.5 4.5-3 6L12 22l-1.5-9.5c-1.5-1.5-3-3.5-3-6A4.5 4.5 0 0112 2z" stroke={c} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  ),
  'star': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={c} />
    </Svg>
  ),
  'star-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke={c} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  ),
  'checkmark': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'checkmark-circle': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={c} strokeWidth={2} />
      <Path d="M8 12l3 3 5-6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'copy-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="9" width="13" height="13" rx="2" stroke={c} strokeWidth={2} />
      <Path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'send': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'happy-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={c} strokeWidth={2} />
      <Path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={c} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="9" cy="9" r="1" fill={c} />
      <Circle cx="15" cy="9" r="1" fill={c} />
    </Svg>
  ),
  'sparkles-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" stroke={c} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75L19 3z" stroke={c} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  ),
  'videocam-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M23 7l-7 5 7 5V7z" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="1" y="5" width="15" height="14" rx="2" stroke={c} strokeWidth={2} />
    </Svg>
  ),
  'camera-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="13" r="4" stroke={c} strokeWidth={2} />
    </Svg>
  ),
  'phone-portrait-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="2" width="14" height="20" rx="2" stroke={c} strokeWidth={2} />
      <Line x1="12" y1="18" x2="12.01" y2="18" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'cart': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'flag': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill={c} />
      <Line x1="4" y1="22" x2="4" y2="15" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'notifications': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'notifications-off': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M13.73 21a2 2 0 01-3.46 0M18.63 13A17.89 17.89 0 0118 8M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14M18 8a6 6 0 00-9.33-4.99" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="1" y1="1" x2="23" y2="23" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'alarm-outline': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="13" r="8" stroke={c} strokeWidth={2} />
      <Path d="M12 9v4l2.5 2.5M5 3L2.5 5.5M19 3l2.5 2.5" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'mic': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="2" width="6" height="12" rx="3" stroke={c} strokeWidth={2} />
      <Path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  'mic-off': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 16.95A7 7 0 015 10M12 19v3M9 22h6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="1" y1="1" x2="23" y2="23" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  'phone-down': (c, s) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.13 19.13 0 015 11.6a19.79 19.79 0 01-3.07-8.67A2 2 0 013.11 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 15.92z" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="23" y1="1" x2="17" y2="7" stroke={c} strokeWidth={2} strokeLinecap="round" />
      <Line x1="17" y1="1" x2="23" y2="7" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
};

export function AppIcon({ name, size = 24, color = '#fff', style }: Props) {
  const render = ICONS[name];
  if (!render) return null;
  return render(color, size);
}
