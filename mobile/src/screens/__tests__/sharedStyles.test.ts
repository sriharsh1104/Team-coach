import { getThemeColors, THEME_OPTIONS } from '../../theme';
import { sharedStylesFactory } from '../shared';

const PALETTE_IDS = THEME_OPTIONS.map((t) => t.id);

describe('sharedStylesFactory', () => {
  it.each(PALETTE_IDS)('builds the %s palette from its own tokens', (themeId) => {
    const c = getThemeColors(themeId);
    const styles = sharedStylesFactory(c);

    expect(styles.input.backgroundColor).toBe(c.surface);
    expect(styles.input.borderColor).toBe(c.border);
    expect(styles.input.color).toBe(c.text);
    expect(styles.title.color).toBe(c.text);
    expect(styles.button.backgroundColor).toBe(c.chrome);
  });

  it('gives the input a different background per theme', () => {
    // The old hardcoded rgba(0,0,0,0.28) was the same dark well everywhere,
    // which put dark text on a dark field in the light palettes.
    const backgrounds = PALETTE_IDS.map(
      (id) => sharedStylesFactory(getThemeColors(id)).input.backgroundColor,
    );
    expect(new Set(backgrounds).size).toBe(PALETTE_IDS.length);
  });

  it('never hardcodes a colour the theme does not supply', () => {
    for (const id of PALETTE_IDS) {
      const c = getThemeColors(id);
      const allowed = new Set<unknown>([
        ...Object.values(c),
        'transparent',
        undefined,
      ]);
      const styles = sharedStylesFactory(c) as Record<
        string,
        Record<string, unknown>
      >;
      const offenders: string[] = [];
      for (const [name, rules] of Object.entries(styles)) {
        for (const key of ['color', 'backgroundColor', 'borderColor'] as const) {
          if (!(key in rules)) continue;
          if (!allowed.has(rules[key])) {
            offenders.push(`${name}.${key} = ${String(rules[key])}`);
          }
        }
      }
      // Named so a failure says which style broke, not just "false".
      expect({ theme: id, offenders }).toEqual({ theme: id, offenders: [] });
    }
  });
});
