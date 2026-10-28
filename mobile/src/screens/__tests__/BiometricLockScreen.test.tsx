import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { BiometricLockScreen } from '../BiometricLockScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext');

const mockedUseAuth = useAuth as jest.Mock;

const retryBiometricUnlock = jest.fn();
const dismissBiometricLock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ retryBiometricUnlock, dismissBiometricLock });
});

describe('BiometricLockScreen', () => {
  it('calls retryBiometricUnlock when Unlock is pressed', () => {
    render(<BiometricLockScreen />);

    fireEvent.press(screen.getByText('Unlock'));

    expect(retryBiometricUnlock).toHaveBeenCalledTimes(1);
    expect(dismissBiometricLock).not.toHaveBeenCalled();
  });

  it('calls dismissBiometricLock when "Use password instead" is pressed', () => {
    render(<BiometricLockScreen />);

    fireEvent.press(screen.getByText('Use password instead'));

    expect(dismissBiometricLock).toHaveBeenCalledTimes(1);
    expect(retryBiometricUnlock).not.toHaveBeenCalled();
  });
});
