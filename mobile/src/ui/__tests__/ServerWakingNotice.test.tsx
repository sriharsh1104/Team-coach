import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { resetWarmup, warmUpServer } from '../../perf/serverWarmup';
import { ServerWakingNotice } from '../ServerWakingNotice';

describe('ServerWakingNotice', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetWarmup();
    // Never resolves: keeps the warm-up pinned in its "warming" state.
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays out of the way before any warm-up starts', () => {
    render(<ServerWakingNotice />);
    expect(screen.queryByText(/Waking the server/)).toBeNull();
  });

  it('says nothing for a warm-up that is still quick', () => {
    warmUpServer();
    render(<ServerWakingNotice />);

    act(() => jest.advanceTimersByTime(1000));

    expect(screen.queryByText(/Waking the server/)).toBeNull();
  });

  it('explains the wait once it becomes noticeable', () => {
    warmUpServer();
    render(<ServerWakingNotice />);

    act(() => jest.advanceTimersByTime(3000));

    expect(screen.getByText(/Waking the server/)).toBeTruthy();
  });
});
