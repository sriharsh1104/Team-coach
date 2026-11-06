import React from 'react';
import Constants from 'expo-constants';
import * as ReactNavigation from '@react-navigation/native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { GoogleSignInButtonInner } from '../GoogleSignInButtonInner';
import { useAuth } from '../AuthContext';
import { emitToast } from '../../ui/toastBus';

function renderButton() {
  return render(<GoogleSignInButtonInner />);
}

const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockHasPlayServices = jest.fn();
const mockConfigure = jest.fn();
const mockIsSuccessResponse = jest.fn(
  (r: { type?: string }) => r?.type === 'success',
);
const mockIsErrorWithCode = jest.fn(() => false);
const mockStatusCodes = { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' };

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockConfigure(...args),
    hasPlayServices: (...args: unknown[]) => mockHasPlayServices(...args),
    signIn: (...args: unknown[]) => mockSignIn(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
  isSuccessResponse: (r: { type?: string }) => mockIsSuccessResponse(r),
  isErrorWithCode: (e: unknown) => mockIsErrorWithCode(e),
  statusCodes: mockStatusCodes,
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));
jest.mock('../AuthContext');
jest.mock('../../ui/toastBus', () => ({
  emitToast: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseNavigation = ReactNavigation.useNavigation as jest.Mock;
const mockedConstants = Constants as unknown as {
  expoConfig: { extra: Record<string, unknown> };
};
const mockedEmitToast = emitToast as jest.Mock;

const loginWithGoogle = jest.fn();
const navigate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedConstants.expoConfig = { extra: {} };
  mockedUseAuth.mockReturnValue({ loginWithGoogle });
  mockedUseNavigation.mockReturnValue({ navigate });
  mockHasPlayServices.mockResolvedValue(true);
  mockSignOut.mockResolvedValue(undefined);
  mockSignIn.mockResolvedValue({
    type: 'success',
    data: { idToken: 'id-token-123' },
  });
  mockIsSuccessResponse.mockImplementation(
    (r: { type?: string }) => r?.type === 'success',
  );
  mockIsErrorWithCode.mockReturnValue(false);
});

describe('GoogleSignInButtonInner', () => {
  it('toasts instead of prompting when Google sign-in is not configured', async () => {
    renderButton();

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    expect(mockedEmitToast).toHaveBeenCalledWith(
      expect.stringContaining('not configured'),
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('prompts the native Google flow when configured', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    renderButton();

    await waitFor(() => expect(mockConfigure).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expect(mockConfigure).toHaveBeenCalledWith(
      expect.objectContaining({ webClientId: 'web-client-id' }),
    );
  });

  it('logs in with the id token on a successful response', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    loginWithGoogle.mockResolvedValue(undefined);
    renderButton();

    await waitFor(() => expect(mockConfigure).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() =>
      expect(loginWithGoogle).toHaveBeenCalledWith('id-token-123'),
    );
  });

  it('navigates to TwoFactorChallenge when loginWithGoogle reports 2FA is required', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    loginWithGoogle.mockResolvedValue({
      requiresTwoFactor: true,
      challengeToken: 'challenge-token',
    });
    renderButton();

    await waitFor(() => expect(mockConfigure).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('TwoFactorChallenge', {
        challengeToken: 'challenge-token',
      }),
    );
  });

  it('toasts when loginWithGoogle rejects with a non-axios error', async () => {
    mockedConstants.expoConfig = { extra: { googleWebClientId: 'web-client-id' } };
    loginWithGoogle.mockRejectedValue({ message: 'Invalid Google token' });
    renderButton();

    await waitFor(() => expect(mockConfigure).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByText('Continue with Google'));
    });

    await waitFor(() =>
      expect(mockedEmitToast).toHaveBeenCalledWith('Invalid Google token'),
    );
  });
});
