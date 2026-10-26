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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SignupScreen', () => {
  it('blocks submission until name, email, and an 8+ character password are all present', async () => {
    const signup = jest.fn();
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'Player One');
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'player1@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password (min 8 characters)'), 'short');
    await pressAndSettle('Sign Up');
    expect(signup).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Password (min 8 characters)'), 'password123');
    await pressAndSettle('Sign Up');
    expect(signup).toHaveBeenCalledTimes(1);
  });

  it('calls signup with trimmed email and name, password as typed', async () => {
    const signup = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Full name'), '  Player One  ');
    fireEvent.changeText(screen.getByPlaceholderText('Email'), '  player1@example.com  ');
    fireEvent.changeText(screen.getByPlaceholderText('Password (min 8 characters)'), 'password123');
    await pressAndSettle('Sign Up');

    expect(signup).toHaveBeenCalledWith('player1@example.com', 'password123', 'Player One');
  });

  it('shows an alert on signup failure (e.g. duplicate email)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const signup = jest.fn().mockRejectedValue({
      response: { data: { message: 'An account with this email already exists' } },
    });
    mockedUseAuth.mockReturnValue({ signup });
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'Player One');
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'player1@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password (min 8 characters)'), 'password123');
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
