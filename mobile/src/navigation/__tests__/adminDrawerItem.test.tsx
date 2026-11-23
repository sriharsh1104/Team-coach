import { act, renderHook } from '@testing-library/react-native';
import { useAuth } from '../../auth/AuthContext';
import { drawerItemKeyForRoute } from '../drawerActive';
import { useGuildDrawer, useOrgDrawer } from '../useAppDrawer';

jest.mock('../../auth/AuthContext');

const mockedUseAuth = useAuth as jest.Mock;

const navigation = {
  navigate: jest.fn(),
  dispatch: jest.fn(),
  push: jest.fn(),
  isFocused: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
  getState: jest.fn(() => ({ routes: [], index: 0 })),
} as any;

/** Opens the drawer so `sections` is built against a navigation object. */
function openDrawer(hook: ReturnType<typeof renderHook>) {
  act(() => {
    (hook.result.current as { openWith: (n: unknown) => void }).openWith(navigation);
  });
}

function itemKeys(sections: Array<{ items: Array<{ key: string }> }>) {
  return sections.flatMap((s) => s.items.map((i) => i.key));
}

describe('Admin drawer item', () => {
  beforeEach(() => jest.clearAllMocks());

  function auth(isPlatformAdmin: boolean) {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Rhea', isPlatformAdmin },
      org: { id: 'org-1', name: 'Alpha', role: 'COACH', isOwner: false },
      guild: null,
    });
  }

  it('is hidden from an ordinary member', () => {
    auth(false);
    const hook = renderHook(() => useOrgDrawer());
    openDrawer(hook);
    expect(itemKeys(hook.result.current.sections)).not.toContain('admin');
  });

  it('shows for a platform admin', () => {
    auth(true);
    const hook = renderHook(() => useOrgDrawer());
    openDrawer(hook);
    expect(itemKeys(hook.result.current.sections)).toContain('admin');
  });

  it('shows in the guild-only drawer too (an admin may have no org)', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Rhea', isPlatformAdmin: true },
      org: null,
      guild: { id: 'g1', name: 'Sacred' },
    });
    const hook = renderHook(() => useGuildDrawer());
    openDrawer(hook);
    expect(itemKeys(hook.result.current.sections)).toContain('admin');
  });

  it('is hidden in the guild-only drawer for a non-admin', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Rhea', isPlatformAdmin: false },
      org: null,
      guild: { id: 'g1', name: 'Sacred' },
    });
    const hook = renderHook(() => useGuildDrawer());
    openDrawer(hook);
    expect(itemKeys(hook.result.current.sections)).not.toContain('admin');
  });

  it('treats a missing flag as not an admin', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Rhea' },
      org: { id: 'org-1', name: 'Alpha', role: 'COACH', isOwner: false },
      guild: null,
    });
    const hook = renderHook(() => useOrgDrawer());
    openDrawer(hook);
    expect(itemKeys(hook.result.current.sections)).not.toContain('admin');
  });

  it('highlights the Admin item while the Admin screen is open', () => {
    // Without this mapping the drawer shows no active row on /admin.
    expect(drawerItemKeyForRoute('Admin')).toBe('admin');
  });

  it('marks it active in the built sections', () => {
    auth(true);
    const hook = renderHook(() => useOrgDrawer());
    openDrawer(hook);
    act(() => hook.result.current.setRouteName('Admin'));

    const admin = hook.result.current.sections
      .flatMap((s) => s.items)
      .find((i) => i.key === 'admin');
    expect(admin?.active).toBe(true);
  });
});

describe('1-on-1 voice drawer item', () => {
  beforeEach(() => jest.clearAllMocks());

  function auth(canDirectVoice: boolean | undefined, withOrg = true) {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Rhea', canDirectVoice },
      org: withOrg
        ? { id: 'org-1', name: 'Alpha', role: 'COACH', isOwner: false }
        : null,
      guild: withOrg ? null : { id: 'g1', name: 'Sacred' },
    });
  }

  // Private / 1-on-1 lives on the DM header call button, not the sidebar.
  it('never shows a Private / 1-on-1 Voice row in the org drawer', () => {
    auth(true);
    const hook = renderHook(() => useOrgDrawer());
    openDrawer(hook);
    expect(itemKeys(hook.result.current.sections)).not.toContain('directVoice');
    expect(hook.result.current.sections.map((s) => s.key)).not.toContain(
      'private',
    );
  });

  it('never shows a Private / 1-on-1 Voice row in the guild drawer either', () => {
    auth(true, false);
    const hook = renderHook(() => useGuildDrawer());
    openDrawer(hook);
    expect(itemKeys(hook.result.current.sections)).not.toContain('directVoice');
    expect(hook.result.current.sections.map((s) => s.key)).not.toContain(
      'private',
    );
  });
});
