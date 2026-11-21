import React from 'react';
import { ScrollView, Text } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { usePullToRefresh } from '../usePullToRefresh';

function Harness({ load }: { load: () => Promise<unknown> }) {
  const refreshControl = usePullToRefresh(load);
  return (
    <ScrollView testID="list" refreshControl={refreshControl}>
      <Text>rows</Text>
    </ScrollView>
  );
}

function control() {
  return screen.getByTestId('list').props.refreshControl.props;
}

/** Invoke the handler RefreshControl calls when the user pulls the list. */
function pull() {
  control().onRefresh();
}

describe('usePullToRefresh', () => {
  it('is not spinning before anything is pulled', () => {
    render(<Harness load={jest.fn().mockResolvedValue(undefined)} />);
    expect(control().refreshing).toBe(false);
  });

  it('runs the loader and stops spinning when it resolves', async () => {
    let release: (() => void) | undefined;
    const load = jest.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    render(<Harness load={load} />);

    await act(async () => pull());
    expect(load).toHaveBeenCalledTimes(1);
    expect(control().refreshing).toBe(true);

    await act(async () => release!());
    expect(control().refreshing).toBe(false);
  });

  it('stops spinning when the loader rejects', async () => {
    // The axios interceptor already toasts; the spinner must not get stuck.
    const load = jest.fn().mockRejectedValue(new Error('offline'));
    render(<Harness load={load} />);

    await act(async () => pull());

    expect(control().refreshing).toBe(false);
  });
});
