import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export type BrandShareIconName = 'whatsapp' | 'telegram' | 'discord';

export const BRAND_COLORS: Record<BrandShareIconName, string> = {
  whatsapp: '#25D366',
  telegram: '#229ED9',
  discord: '#5865F2',
};

/** Round brand-colored badge with a simplified platform glyph. */
export function BrandShareIcon({ name, size = 44 }: { name: BrandShareIconName; size?: number }) {
  const bg = BRAND_COLORS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <Circle cx="22" cy="22" r="22" fill={bg} />
      {name === 'whatsapp' && (
        <>
          <Path
            d="M22 10.5a11.5 11.5 0 0 0-9.8 17.5L10.6 33.6l5.8-1.5A11.5 11.5 0 1 0 22 10.5z"
            stroke="#fff"
            strokeWidth={2.2}
            fill="none"
            strokeLinejoin="round"
          />
          <Path
            d="M18.3 17.2c-.5 3.4 3.4 8.4 8 9l1.6-1.9-2.6-1.4-1.2 1c-1.2-.5-2.7-2-3.1-3.2l1-1.2-1.3-2.5z"
            fill="#fff"
          />
        </>
      )}
      {name === 'telegram' && (
        <Path d="M33.5 11 10.8 20.2l6.3 2.2 2.4 7.6 3.6-4.5 6.2 4.6L33.5 11z" fill="#fff" />
      )}
      {name === 'discord' && (
        <>
          <Path
            d="M12.5 15.2c2.7-1.5 5.6-2.2 9.5-2.2s6.8.7 9.5 2.2c2 3.9 2.7 8 2.3 12.3-1.8 1.3-3.6 2.1-5.4 2.6l-1.3-2.2c.9-.3 1.7-.7 2.4-1.2-4.6 1.9-9.4 1.9-14 0 .7.5 1.5.9 2.4 1.2l-1.3 2.2c-1.8-.5-3.6-1.3-5.4-2.6-.4-4.3.3-8.4 2.3-12.3z"
            fill="#fff"
          />
          <Circle cx="17.8" cy="22.2" r="1.9" fill={bg} />
          <Circle cx="26.2" cy="22.2" r="1.9" fill={bg} />
        </>
      )}
    </Svg>
  );
}
