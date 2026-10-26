import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { LoginScreen } from '../LoginScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext');
jest.mock('../../auth/GoogleSignInButton', () => ({
  GoogleSignInButton: () => null,
}));

const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

function renderScreen() {
  return render(<LoginScreen navigation={navigation} route={{} as any} />);
}

// fireEvent.press alone doesn't wait for the async onPress handler (await
// login(), catch, the `finally` setIsSubmitting) to fully settle, which
// produces an "update not wrapped in act()" warning even though the
// assertions are correct. Wrapping in act(async () => ...) lets the whole
// chain finish before we assert.
async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoginScreen', () => {
  it('blocks submission until both email and password are filled (Pressable disabled prop actually prevents onPress)', async () => {
    const login = jest.fn();
    mockedUseAuth.mockReturnValue({ login });
    renderScreen();

    await pressAndSettle('Log In');
    expect(login).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'player1@example.com');
    await pressAndSettle('Log In');
    expect(login).not.toHaveBeenCalled(); // password still empty

    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    await pressAndSettle('Log In');
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('calls login with the trimmed email and the password exactly as typed', async () => {
    const login = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ login });
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Email'), '  player1@example.com  ');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    await pressAndSettle('Log In');

    expect(login).toHaveBeenCalledWith('player1@example.com', 'password123');
  });

  it('shows an alert with the server message when login fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const login = jest.fn().mockRejectedValue({
      response: { data: { message: 'Invalid email or password' } },
    });
    mockedUseAuth.mockReturnValue({ login });
    renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'player1@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
    await pressAndSettle('Log In');

    expect(alertSpy).toHaveBeenCalledWith('Login failed', 'Invalid email or password');
  });

  it('navigates to Signup when the link is pressed', () => {
    mockedUseAuth.mockReturnValue({ login: jest.fn() });
    renderScreen();

    fireEvent.press(screen.getByText('New here? Create an account'));
    expect(navigation.navigate).toHaveBeenCalledWith('Signup');
  });
});
