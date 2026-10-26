import React from 'react';
import { Alert } from 'react-native';
import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { useAuth } from '../AuthContext';

jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: jest.fn(),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));
jest.mock('../AuthContext');

const mockedUseIdTokenAuthRequest = Google.useIdTokenAuthRequest as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedConstants = Constants as unknown as { expoConfig: { extra: Record<string, unknown> } };

const promptAsync = jest.fn();
const loginWithGoogle = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedConstants.expoConfig = { extra: {} };
  mockedUseAuth.mockReturnValue({ loginWithGoogle });
  mockedUseIdTokenAuthRequest.mockReturnValue([{}, null, promptAsync]);
});

describe('GoogleSignInButton', () => {
  it('BUG: the "not configured" Pressable is disabled, so its own warning alert can never fire', async () => {
    // onPress has an `if (!isConfigured) Alert.alert(...)` branch, but the
    // Pressable's `disabled` prop is already `!request || !isConfigured` —
    // so whenever that branch would fire, onPress never runs at all. The
    // user sees a silently-disabled button with no explanation, not the
    // intended "add your Google client ID" message. This documents the bug
    // rather than fixing it, since the fix (which element should actually
    // be disabled) is a product call.
    render(<GoogleSignInButton />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();
  });

  it('does not prompt while the auth request is not yet ready, even if configured', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    mockedUseIdTokenAuthRequest.mockReturnValue([null, null, promptAsync]);
    render(<GoogleSignInButton />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    expect(promptAsync).not.toHaveBeenCalled();
  });

  it('prompts the Google auth flow when configured and ready', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    mockedUseIdTokenAuthRequest.mockReturnValue([{}, null, promptAsync]);
    render(<GoogleSignInButton />);

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    expect(promptAsync).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('logs in with the id token on a successful response', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    loginWithGoogle.mockResolvedValue(undefined);
    mockedUseIdTokenAuthRequest.mockReturnValue([
      {},
      { type: 'success', params: { id_token: 'id-token-123' } },
      promptAsync,
    ]);
    render(<GoogleSignInButton />);

    await act(async () => {});

    expect(loginWithGoogle).toHaveBeenCalledWith('id-token-123');
  });

  it('shows an alert when loginWithGoogle rejects after a successful response', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    loginWithGoogle.mockRejectedValue({ message: 'Invalid Google token' });
    mockedUseIdTokenAuthRequest.mockReturnValue([
      {},
      { type: 'success', params: { id_token: 'id-token-123' } },
      promptAsync,
    ]);
    render(<GoogleSignInButton />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith('Google sign-in failed', 'Invalid Google token');
  });

  it('shows an alert when the auth flow itself errors', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    mockedUseIdTokenAuthRequest.mockReturnValue([{}, { type: 'error' }, promptAsync]);
    render(<GoogleSignInButton />);

    await act(async () => {});

    expect(Alert.alert).toHaveBeenCalledWith('Google sign-in failed', 'Please try again.');
    expect(loginWithGoogle).not.toHaveBeenCalled();
  });
});
