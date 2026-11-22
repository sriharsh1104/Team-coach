import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { VoiceProvider, useVoiceContext } from '../VoiceContext';

let mockHookCalls = 0;
let mockStatus = 'idle';

// A real hook returns a fresh object every render — that is what used to
// make the holder → provider → holder update cycle spin forever.
let mockSetHostedStatus: ((s: string) => void) | null = null;

jest.mock('../useHostedVoiceChannel', () => ({
  useHostedVoiceChannel: (_url: string, _token: string, opts?: { room?: string }) => {
    mockHookCalls += 1;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useState } = require('react');
    const [status, setStatus] = useState(mockStatus);
    mockSetHostedStatus = setStatus;
    return {
      status,
      participants: [],
      join: jest.fn(),
      leave: jest.fn(),
      room: opts?.room ?? 'team',
    };
  },
}));
jest.mock('../useSelfHostedVoiceChannel', () => ({
  useSelfHostedVoiceChannel: (_token: string, room?: string) => {
    mockHookCalls += 1;
    return {
      status: mockStatus,
      participants: [],
      join: jest.fn(),
      leave: jest.fn(),
      room: room ?? 'team',
    };
  },
}));

function Activator({ mode }: { mode: 'hosted' | 'self' }) {
  const { activate, controller } = useVoiceContext();
  useEffect(() => {
    activate(
      mode === 'hosted'
        ? { mode: 'hosted', url: 'wss://lk', token: 't', room: 'guild' }
        : { mode: 'self', token: 't', room: 'team' },
    );
  }, [activate, mode]);
  return <Text>{controller ? `status:${controller.status}` : 'none'}</Text>;
}

async function settle() {
  for (let i = 0; i < 20; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe('VoiceProvider', () => {
  beforeEach(() => {
    mockHookCalls = 0;
    mockStatus = 'idle';
  });

  it.each(['hosted', 'self'] as const)(
    'does not re-render forever once a %s session is active (app hang)',
    async (mode) => {
      render(
        <VoiceProvider>
          <Activator mode={mode} />
        </VoiceProvider>,
      );
      await settle();
      expect(screen.getByText('status:idle')).toBeTruthy();
      const settled = mockHookCalls;
      await settle();
      // Idle session: no new renders at all once things settle.
      expect(mockHookCalls).toBe(settled);
      expect(settled).toBeLessThan(10);
    },
  );

  it('still passes real state changes (e.g. connected) up to the screen', async () => {
    render(
      <VoiceProvider>
        <Activator mode="hosted" />
      </VoiceProvider>,
    );
    await settle();
    expect(screen.getByText('status:idle')).toBeTruthy();

    await act(async () => {
      mockSetHostedStatus?.('connected');
    });
    await settle();
    expect(screen.getByText('status:connected')).toBeTruthy();
  });

  it('keeps a connected call when the screen re-activates with a fresh token', async () => {
    let activateFn: ((c: Parameters<ReturnType<typeof useVoiceContext>['activate']>[0]) => void) | null = null;
    function Probe() {
      const { activate, controller } = useVoiceContext();
      activateFn = activate;
      useEffect(() => {
        activate({ mode: 'hosted', url: 'wss://lk', token: 'token-1', room: 'team' });
      }, [activate]);
      return <Text>{controller ? `status:${controller.status}` : 'none'}</Text>;
    }
    render(
      <VoiceProvider>
        <Probe />
      </VoiceProvider>,
    );
    await settle();
    await act(async () => {
      mockSetHostedStatus?.('connected');
    });
    await settle();
    expect(screen.getByText('status:connected')).toBeTruthy();

    // Re-opening the voice screen fetches a brand-new LiveKit token.
    await act(async () => {
      activateFn?.({ mode: 'hosted', url: 'wss://lk', token: 'token-2', room: 'team' });
    });
    await settle();
    // Holder was not remounted → still connected (a remount would reset to idle).
    expect(screen.getByText('status:connected')).toBeTruthy();
  });

  it('does not silently switch rooms while connected (team ↔ guild)', async () => {
    let activateFn: ((c: Parameters<ReturnType<typeof useVoiceContext>['activate']>[0]) => void) | null = null;
    let roomLabel = '';
    function Probe() {
      const { activate, controller } = useVoiceContext();
      activateFn = activate;
      roomLabel = controller?.room ?? 'none';
      useEffect(() => {
        activate({ mode: 'hosted', url: 'wss://lk', token: 't1', room: 'guild' });
      }, [activate]);
      return (
        <Text>
          {controller ? `status:${controller.status}|room:${controller.room ?? 'team'}` : 'none'}
        </Text>
      );
    }
    render(
      <VoiceProvider>
        <Probe />
      </VoiceProvider>,
    );
    await settle();
    await act(async () => {
      mockSetHostedStatus?.('connected');
    });
    await settle();
    expect(screen.getByText('status:connected|room:guild')).toBeTruthy();

    const hooksBefore = mockHookCalls;
    await act(async () => {
      activateFn?.({ mode: 'hosted', url: 'wss://lk', token: 't2', room: 'team' });
    });
    await settle();
    // Still on guild — refuse remount that would drop the live call.
    expect(screen.getByText('status:connected|room:guild')).toBeTruthy();
    expect(mockHookCalls).toBe(hooksBefore);
    expect(roomLabel).toBe('guild');
  });

  it('drops the session when a live call ends (kick / other device / leave)', async () => {
    render(
      <VoiceProvider>
        <Activator mode="hosted" />
      </VoiceProvider>,
    );
    await settle();
    await act(async () => {
      mockSetHostedStatus?.('connected');
    });
    await settle();
    expect(screen.getByText('status:connected')).toBeTruthy();

    // LiveKit identity is the user id, so joining from a second device kicks
    // this one (DUPLICATE_IDENTITY) and the hook falls back to idle. The
    // provider must let go of the dead holder instead of keeping a zombie
    // controller behind the floating widget / voice screen.
    await act(async () => {
      mockSetHostedStatus?.('idle');
    });
    await settle();
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('keeps an errored session mounted so the screen can offer Try Again', async () => {
    render(
      <VoiceProvider>
        <Activator mode="hosted" />
      </VoiceProvider>,
    );
    await settle();
    await act(async () => {
      mockSetHostedStatus?.('connected');
    });
    await settle();
    await act(async () => {
      mockSetHostedStatus?.('error');
    });
    await settle();
    expect(screen.getByText('status:error')).toBeTruthy();
  });

  it('never tears down a session that has not connected yet', async () => {
    render(
      <VoiceProvider>
        <Activator mode="hosted" />
      </VoiceProvider>,
    );
    await settle();
    // Sits at idle until the user taps Join — the holder must stay mounted.
    expect(screen.getByText('status:idle')).toBeTruthy();
    await settle();
    expect(screen.getByText('status:idle')).toBeTruthy();
  });
});
