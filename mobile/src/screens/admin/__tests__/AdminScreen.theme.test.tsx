import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AdminScreen } from '../AdminScreen';
import * as adminApi from '../../../api/admin';
import { getThemeColors, THEME_OPTIONS, ThemeId } from '../../../theme';
import { ThemeProvider } from '../../../theme/ThemeContext';

jest.mock('../../../api/admin');

const mockedApi = adminApi as jest.Mocked<typeof adminApi>;

/** Same key ThemeContext persists the user's choice under. */
const THEME_STORAGE_KEY = 'team-coach.themeId';

const overview = {
  orgs: 1,
  users: 2,
  verifiedUsers: 2,
  admins: 1,
  messages: 3,
  scrims: 0,
  newUsersLast7Days: 1,
};

async function renderInTheme(themeId: ThemeId) {
  await SecureStore.setItemAsync(THEME_STORAGE_KEY, themeId);
  render(
    <ThemeProvider>
      <AdminScreen />
    </ThemeProvider>,
  );
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  await waitFor(() => expect(screen.getByText('Alpha Squad')).toBeTruthy());
}

function flatten(style: unknown): Record<string, unknown> {
  const parts = Array.isArray(style) ? style.flat(Infinity) : [style];
  return Object.assign({}, ...parts.filter(Boolean));
}

/**
 * SoftPressable keeps layout props on the Pressable and moves the visual
 * ones (background, border) onto the animated child, so a row's colours live
 * one level down from the element carrying the accessibility label.
 */
function visualStyleOf(label: string): Record<string, unknown> {
  const pressable = screen.getByLabelText(label);
  const animatedChild = pressable.children[0] as { props?: { style?: unknown } };
  return flatten(animatedChild?.props?.style);
}

describe('AdminScreen theming', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockedApi.getOverview.mockResolvedValue(overview);
    mockedApi.listOrgs.mockResolvedValue({
      total: 1,
      skip: 0,
      take: 25,
      orgs: [
        {
          id: 'org-1',
          name: 'Alpha Squad',
          createdAt: '2026-01-01T00:00:00.000Z',
          rosterCount: 4,
          guildCount: 9,
          messageCount: 120,
          owner: { id: 'u1', name: 'Rhea', email: 'rhea@example.com' },
        },
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    (SecureStore as unknown as { clear: () => void }).clear();
  });

  // Covers every palette the user can pick, so a hardcoded colour sneaking
  // into this screen shows up as a failure rather than as an unreadable
  // light-on-light row someone notices months later.
  it.each(THEME_OPTIONS.map((t) => t.id))('uses the %s palette', async (themeId) => {
    const palette = getThemeColors(themeId);
    await renderInTheme(themeId);

    const row = visualStyleOf('Alpha Squad, 4 roster members');
    expect(row.backgroundColor).toBe(palette.surface);
    expect(row.borderColor).toBe(palette.border);

    expect(flatten(screen.getByText('Alpha Squad').props.style).color).toBe(
      palette.text,
    );
    expect(
      flatten(screen.getByText(/rhea@example.com/).props.style).color,
    ).toBe(palette.textMuted);
    expect(
      flatten(screen.getByText('Everything across the platform. Read-only.').props.style)
        .color,
    ).toBe(palette.textMuted);
  });

  it('renders different colours for different themes', async () => {
    await renderInTheme('black');
    const dark = flatten(screen.getByText('Alpha Squad').props.style).color;
    screen.unmount();

    await renderInTheme('white');
    const light = flatten(screen.getByText('Alpha Squad').props.style).color;

    expect(dark).not.toBe(light);
  });
});
