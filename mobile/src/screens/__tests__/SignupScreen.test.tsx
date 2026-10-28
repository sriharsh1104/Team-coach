import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { SignupScreen } from '../SignupScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext');
jest.mock('../../auth/GoogleSignInButton', () => ({
  GoogleSignInButton: () => null,
}));

const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

function renderScreen() {
  return render(<SignupScreen navigation={navigation} route={{} as any} />);
}

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

function fillForm({
  name = 'Player One',
  email = 'player1@example.com',
  password = 'Password123!',
}: { name?: string; email?: string; password?: string } = {}) {
  fireEvent.changeText(screen.getByPlaceholderText('Full name'), name);
  fireEvent.changeText(screen.getByPlaceholderText('Email'), email);
  fireEvent.changeText(screen.getByPlaceholderText('Password'), password);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SignupScreen', () => {
  it('blocks submission until name, email, and a strong password are all present', async () => {
    const signup = jest.fn();
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fillForm({ password: 'short' });
    await pressAndSettle('Sign Up');
    expect(signup).not.toHaveBeenCalled();

    // Long enough but missing an uppercase letter and a special character.
    fillForm({ password: 'password123' });
    await pressAndSettle('Sign Up');
    expect(signup).not.toHaveBeenCalled();

    fillForm({ password: 'Password123!' });
    await pressAndSettle('Sign Up');
    expect(signup).toHaveBeenCalledTimes(1);
  });

  it('calls signup with trimmed email and name, password as typed', async () => {
    const signup = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fillForm({ name: '  Player One  ', email: '  player1@example.com  ' });
    await pressAndSettle('Sign Up');

    expect(signup).toHaveBeenCalledWith('player1@example.com', 'Password123!', 'Player One');
  });

  it('navigates to EmailVerification with the challenge token when the server requires it', async () => {
    const signup = jest.fn().mockResolvedValue({
      requiresEmailVerification: true,
      challengeToken: 'challenge-token',
    });
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fillForm();
    await pressAndSettle('Sign Up');

    expect(navigation.navigate).toHaveBeenCalledWith('EmailVerification', {
      challengeToken: 'challenge-token',
    });
  });

  it('shows an alert on signup failure (e.g. duplicate email)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const signup = jest.fn().mockRejectedValue({
      response: { data: { message: 'An account with this email already exists' } },
    });
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fillForm();
    await pressAndSettle('Sign Up');

    expect(alertSpy).toHaveBeenCalledWith(
      'Signup failed',
      'An account with this email already exists',
    );
  });

  it('navigates to Login when the link is pressed', () => {
    mockedUseAuth.mockReturnValue({ signup: jest.fn() });
    renderScreen();

    fireEvent.press(screen.getByText('Already have an account? Log in'));
    expect(navigation.navigate).toHaveBeenCalledWith('Login');
  });
});
