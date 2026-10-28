import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { EmailVerificationScreen } from '../EmailVerificationScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext');

const mockedUseAuth = useAuth as jest.Mock;
const route = { params: { challengeToken: 'challenge-token' } } as any;
const navigation = {} as any;

const completeEmailVerification = jest.fn();
const resendEmailVerification = jest.fn();

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedUseAuth.mockReturnValue({ completeEmailVerification, resendEmailVerification });
});

describe('EmailVerificationScreen', () => {
  it('submits the 6-digit code to completeEmailVerification', async () => {
    completeEmailVerification.mockResolvedValue(undefined);
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123456');
    await pressAndSettle('Verify');

    expect(completeEmailVerification).toHaveBeenCalledWith('challenge-token', '123456');
  });

  it('blocks submission until something is typed', async () => {
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    await pressAndSettle('Verify');
    expect(completeEmailVerification).not.toHaveBeenCalled();
  });

  it('shows an alert with the server message on failure', async () => {
    completeEmailVerification.mockRejectedValue({
      response: { data: { message: 'Invalid code' } },
    });
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '000000');
    await pressAndSettle('Verify');

    expect(Alert.alert).toHaveBeenCalledWith('Could not verify', 'Invalid code');
  });

  it('resends the code and starts a cooldown on the resend link', async () => {
    resendEmailVerification.mockResolvedValue(undefined);
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    await pressAndSettle('Resend code');

    expect(resendEmailVerification).toHaveBeenCalledWith('challenge-token');
    expect(screen.getByText('Resend code (30s)')).toBeTruthy();
  });

  it('shows an alert with the server message when resend fails', async () => {
    resendEmailVerification.mockRejectedValue({
      response: { data: { message: 'Too many requests' } },
    });
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    await pressAndSettle('Resend code');

    expect(Alert.alert).toHaveBeenCalledWith('Could not resend code', 'Too many requests');
  });
});
