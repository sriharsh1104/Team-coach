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
  useHostedVoiceChannel: () => {
    mockHookCalls += 1;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useState } = require('react');
    const [status, setStatus] = useState(mockStatus);
    mockSetHostedStatus = setStatus;
    return { status, participants: [], join: jest.fn(), leave: jest.fn() };
  },
}));
jest.mock('../useSelfHostedVoiceChannel', () => ({
  useSelfHostedVoiceChannel: () => {
    mockHookCalls += 1;
    return { status: mockStatus, participants: [], join: jest.fn(), leave: jest.fn() };
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
});
