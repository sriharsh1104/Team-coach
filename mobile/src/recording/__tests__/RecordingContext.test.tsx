import React from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { RecordingProvider, useRecording } from '../RecordingContext';
import {
  addScreenRecordingStoppedListener,
  discardRecording,
  saveRecordingToGallery,
  startScreenRecording,
} from '../../media/screenRecorder';
import { emitToast } from '../../ui/toastBus';

jest.mock('../../ui/toastBus', () => ({ emitToast: jest.fn() }));
jest.mock('../../media/screenRecorder', () => ({
  startScreenRecording: jest.fn(),
  stopScreenRecording: jest.fn(),
  isScreenRecording: jest.fn(() => false),
  addScreenRecordingStoppedListener: jest.fn(() => () => undefined),
  saveRecordingToGallery: jest.fn(),
  discardRecording: jest.fn(),
}));
jest.mock('../../voice/voiceScreenShareGate', () => ({
  isVoiceScreenSharing: () => false,
}));

const mockedListen = addScreenRecordingStoppedListener as jest.Mock;
const mockedSave = saveRecordingToGallery as jest.Mock;
const mockedDiscard = discardRecording as jest.Mock;
const mockedStart = startScreenRecording as jest.Mock;

function setup(choice: 'Save' | 'Discard') {
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === choice)?.onPress?.(undefined as never);
  });
  const hook = renderHook(() => useRecording(), { wrapper: RecordingProvider });
  const onStopped = mockedListen.mock.calls.at(-1)![0] as (uri: string | null) => void;
  return { hook, onStopped };
}

let originalState: unknown;

beforeEach(() => {
  jest.clearAllMocks();
  // The prompt only shows while the app is open (an Alert can't show from the background).
  originalState = (AppState as { currentState: unknown }).currentState;
  (AppState as { currentState: unknown }).currentState = 'active';
});

afterEach(() => {
  (AppState as { currentState: unknown }).currentState = originalState;
  jest.restoreAllMocks();
});

describe('RecordingContext save / discard prompt', () => {
  it('asks before saving and copies to the gallery on Save', async () => {
    mockedSave.mockResolvedValue('content://media/1');
    const { onStopped } = setup('Save');
    await act(async () => onStopped('file:///cache/sacred-screen-final.mp4'));

    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledWith(
      'Save this recording?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Discard' }),
        expect.objectContaining({ text: 'Save' }),
      ]),
    );
    expect(mockedDiscard).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(emitToast).toHaveBeenCalledWith('Recording saved to gallery 🎬'),
    );
  });

  it('deletes the recording and never touches the gallery on Discard', async () => {
    mockedDiscard.mockResolvedValue(undefined);
    const { onStopped } = setup('Discard');
    await act(async () => onStopped('file:///cache/sacred-screen-final.mp4'));

    await waitFor(() => expect(mockedDiscard).toHaveBeenCalled());
    expect(mockedSave).not.toHaveBeenCalled();
    expect(emitToast).toHaveBeenCalledWith('Recording discarded');
  });

  it('does not offer a chat send when the recording did not start from a chat', async () => {
    mockedSave.mockResolvedValue('content://media/9');
    const { hook, onStopped } = setup('Save');
    await act(async () => onStopped('file:///cache/x.mp4'));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(hook.result.current.pendingShare).toBeNull();
  });

  it('stays quiet when the user closes the Android capture sheet', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockedStart.mockResolvedValue('cancelled');
    try {
      const { hook } = setup('Discard');
      await act(async () => {
        await hook.result.current.startRecording('org:1');
      });
      expect(hook.result.current.recording).toBe(false);
      expect(emitToast).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
    }
  });
});
