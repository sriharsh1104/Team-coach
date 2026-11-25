import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LiveWidget } from '../LiveWidget';
import { useLive } from '../LiveContext';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('../LiveContext');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockedUseLive = useLive as jest.Mock;

const actions = {
  stopLive: jest.fn(),
  pauseLive: jest.fn(),
  resumeLive: jest.fn(),
  toggleMute: jest.fn(),
  toggleFaceCam: jest.fn(),
};

function renderWidget(over: Partial<ReturnType<typeof useLive>> = {}) {
  mockedUseLive.mockReturnValue({
    live: true,
    paused: false,
    muted: false,
    faceCam: false,
    elapsedSec: 65,
    starting: false,
    title: '',
    bannerUri: null,
    youtubeLiveUrl: null,
    startLive: jest.fn(),
    ...actions,
    ...over,
  });
  render(
    <ThemeProvider>
      <LiveWidget />
    </ThemeProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('LiveWidget', () => {
  it('stays out of the way when nothing is streaming', () => {
    renderWidget({ live: false });
    expect(screen.queryByText('LIVE')).toBeNull();
  });

  it('shows how long the stream has been up', () => {
    renderWidget();
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('00:01:05')).toBeTruthy();
  });

  it('keeps the timer visible after expanding controls', () => {
    // Face / Mute / End used to sit on one row and shove the timer off-screen.
    renderWidget();
    fireEvent.press(screen.getByLabelText('Expand live controls'));
    expect(screen.getByText('00:01:05')).toBeTruthy();
    expect(screen.getByLabelText('Show face camera')).toBeTruthy();
  });

  it('stays collapsed until LIVE is tapped', () => {
    renderWidget();
    expect(screen.queryByLabelText('Mute stream')).toBeNull();
    expect(screen.queryByLabelText('End live')).toBeNull();
  });

  it('mutes the stream without pausing it after expand', () => {
    // The whole point of a separate mic button: killing audio for a moment
    // must not drop the video the way pause does.
    renderWidget();
    fireEvent.press(screen.getByLabelText('Expand live controls'));
    fireEvent.press(screen.getByLabelText('Mute stream'));
    expect(actions.toggleMute).toHaveBeenCalled();
    expect(actions.pauseLive).not.toHaveBeenCalled();
  });

  it('offers the way back from muted', () => {
    renderWidget({ muted: true });
    fireEvent.press(screen.getByLabelText('Expand live controls'));
    fireEvent.press(screen.getByLabelText('Unmute stream'));
    expect(actions.toggleMute).toHaveBeenCalled();
  });

  it('turns front face cam on from the widget (default off)', () => {
    renderWidget();
    fireEvent.press(screen.getByLabelText('Expand live controls'));
    fireEvent.press(screen.getByLabelText('Show face camera'));
    expect(actions.toggleFaceCam).toHaveBeenCalled();
  });

  it('offers hide when face cam is already on', () => {
    renderWidget({ faceCam: true });
    fireEvent.press(screen.getByLabelText('Expand live controls'));
    fireEvent.press(screen.getByLabelText('Hide face camera'));
    expect(actions.toggleFaceCam).toHaveBeenCalled();
  });

  it('swaps pause for resume while paused', () => {
    renderWidget({ paused: true });
    expect(screen.getByText('PAUSED')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Expand live controls'));
    fireEvent.press(screen.getByLabelText('Resume live'));
    expect(actions.resumeLive).toHaveBeenCalled();
  });

  it('ends the stream from the widget', () => {
    renderWidget();
    fireEvent.press(screen.getByLabelText('Expand live controls'));
    fireEvent.press(screen.getByLabelText('End live'));
    expect(actions.stopLive).toHaveBeenCalled();
  });
});
