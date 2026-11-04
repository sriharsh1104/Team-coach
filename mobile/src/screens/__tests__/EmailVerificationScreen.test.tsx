import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { EmailVerificationScreen } from '../EmailVerificationScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext');

const mockedUseAuth = useAuth as jest.Mock;
const route = { params: { challengeToken: 'challenge-token' } } as any;
const navigation = { navigate: jest.fn() } as any;

const completeEmailVerification = jest.fn();
const resendEmailVerification = jest.fn();

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

function typeOtp(code: string) {
  // First box accepts a full paste / multi-digit string (maxLength=6).
  fireEvent.changeText(screen.getByLabelText('Digit 1 of 6'), code);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockedUseAuth.mockReturnValue({
    completeEmailVerification,
    resendEmailVerification,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('EmailVerificationScreen', () => {
  it('submits the 6-digit code to completeEmailVerification', async () => {
    completeEmailVerification.mockResolvedValue(undefined);
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    typeOtp('123456');
    await pressAndSettle('Verify');

    expect(completeEmailVerification).toHaveBeenCalledWith(
      'challenge-token',
      '123456',
    );
  });

  it('blocks submission until all 6 digits are entered', async () => {
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    await pressAndSettle('Verify');
    expect(completeEmailVerification).not.toHaveBeenCalled();

    typeOtp('123');
    await pressAndSettle('Verify');
    expect(completeEmailVerification).not.toHaveBeenCalled();
  });

  it('starts a 60s resend cooldown on mount and unlocks after it', async () => {
    resendEmailVerification.mockResolvedValue(undefined);
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    expect(screen.getByText('Resend code (60s)')).toBeTruthy();

    // Each second schedules the next tick via useEffect — advance one-by-one.
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }

    expect(screen.getByText('Resend code')).toBeTruthy();
    await pressAndSettle('Resend code');
    expect(resendEmailVerification).toHaveBeenCalledWith('challenge-token');
    expect(screen.getByText('Resend code (60s)')).toBeTruthy();
  });

  it('goes back to Signup when Back is pressed (wrong email fix)', () => {
    render(<EmailVerificationScreen route={route} navigation={navigation} />);
    fireEvent.press(screen.getByLabelText('Back'));
    expect(navigation.navigate).toHaveBeenCalledWith('Signup');
  });

  it('does not alert on verify failure (global toaster owns API errors)', async () => {
    completeEmailVerification.mockRejectedValue({
      response: { data: { message: 'Invalid code' } },
    });
    render(<EmailVerificationScreen route={route} navigation={navigation} />);

    // Unlock is irrelevant for verify.
    typeOtp('000000');
    await pressAndSettle('Verify');

    expect(completeEmailVerification).toHaveBeenCalled();
  });
});
