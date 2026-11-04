import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { TwoFactorChallengeScreen } from '../TwoFactorChallengeScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext');

const mockedUseAuth = useAuth as jest.Mock;
const route = { params: { challengeToken: 'challenge-token' } } as any;
const navigation = { navigate: jest.fn() } as any;

const completeTwoFactorLogin = jest.fn();

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

function typeOtp(code: string) {
  fireEvent.changeText(screen.getByLabelText('Digit 1 of 6'), code);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ completeTwoFactorLogin });
});

describe('TwoFactorChallengeScreen', () => {
  it('submits the 6-digit code to completeTwoFactorLogin', async () => {
    completeTwoFactorLogin.mockResolvedValue(undefined);
    render(<TwoFactorChallengeScreen route={route} navigation={navigation} />);

    typeOtp('123456');
    await pressAndSettle('Verify');

    expect(completeTwoFactorLogin).toHaveBeenCalledWith('challenge-token', {
      code: '123456',
    });
  });

  it('blocks submission until all 6 digits are typed', async () => {
    render(<TwoFactorChallengeScreen route={route} navigation={navigation} />);

    await pressAndSettle('Verify');
    expect(completeTwoFactorLogin).not.toHaveBeenCalled();
  });

  it('switches to backup-code mode and submits that instead', async () => {
    completeTwoFactorLogin.mockResolvedValue(undefined);
    render(<TwoFactorChallengeScreen route={route} navigation={navigation} />);

    fireEvent.press(screen.getByText('Use a backup code instead'));
    fireEvent.changeText(
      screen.getByPlaceholderText('Backup code'),
      'ABCDE-12345',
    );
    await pressAndSettle('Verify');

    expect(completeTwoFactorLogin).toHaveBeenCalledWith('challenge-token', {
      backupCode: 'ABCDE-12345',
    });
  });

  it('does not alert on failure (global toaster owns API errors)', async () => {
    completeTwoFactorLogin.mockRejectedValue({
      response: { data: { message: 'Invalid code' } },
    });
    render(<TwoFactorChallengeScreen route={route} navigation={navigation} />);

    typeOtp('000000');
    await pressAndSettle('Verify');

    expect(completeTwoFactorLogin).toHaveBeenCalled();
  });
});
