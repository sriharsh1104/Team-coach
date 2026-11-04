import React from 'react';
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
  confirmPassword = password,
}: {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
} = {}) {
  fireEvent.changeText(screen.getByPlaceholderText('Full name'), name);
  fireEvent.changeText(screen.getByPlaceholderText('Email'), email);
  fireEvent.changeText(screen.getByPlaceholderText('Password'), password);
  fireEvent.changeText(
    screen.getByPlaceholderText('Confirm password'),
    confirmPassword,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SignupScreen', () => {
  it('blocks submission until name, email, strong password, and matching confirm are present', async () => {
    const signup = jest.fn();
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fillForm({ password: 'short' });
    await pressAndSettle('Sign Up');
    expect(signup).not.toHaveBeenCalled();

    fillForm({ password: 'password123' });
    await pressAndSettle('Sign Up');
    expect(signup).not.toHaveBeenCalled();

    fillForm({ password: 'Password123!', confirmPassword: 'Password123?' });
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
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

    expect(signup).toHaveBeenCalledWith(
      'player1@example.com',
      'Password123!',
      'Player One',
    );
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

  it('leaves API failures to the global toaster and stays on the form', async () => {
    const signup = jest.fn().mockRejectedValue({
      response: { data: { message: 'An account with this email already exists' } },
    });
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fillForm();
    await pressAndSettle('Sign Up');

    expect(signup).toHaveBeenCalled();
    expect(screen.getByText('Sign Up')).toBeTruthy();
  });

  it('goes back to Login via the back control', () => {
    mockedUseAuth.mockReturnValue({ signup: jest.fn() });
    renderScreen();

    fireEvent.press(screen.getByLabelText('Back'));
    expect(navigation.navigate).toHaveBeenCalledWith('Login');
  });

  it('navigates to Login when the link is pressed', () => {
    mockedUseAuth.mockReturnValue({ signup: jest.fn() });
    renderScreen();

    fireEvent.press(screen.getByText('Already have an account? Log in'));
    expect(navigation.navigate).toHaveBeenCalledWith('Login');
  });
});
