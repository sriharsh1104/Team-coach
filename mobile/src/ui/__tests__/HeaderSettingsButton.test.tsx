import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HeaderSettingsButton } from '../HeaderSettingsButton';
import { ThemeProvider } from '../../theme/ThemeContext';
import { useAuth } from '../../auth/AuthContext';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../auth/AuthContext');

const mockedUseAuth = useAuth as jest.Mock;

function openMenu() {
  render(
    <ThemeProvider>
      <HeaderSettingsButton />
    </ThemeProvider>,
  );
  fireEvent.press(screen.getByLabelText('Account Settings'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({ logout: jest.fn() });
});

describe('HeaderSettingsButton', () => {
  it('offers Permissions in the settings dropdown, next to Security', () => {
    openMenu();
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Permissions')).toBeTruthy();
    expect(screen.getByText('Theme')).toBeTruthy();
    expect(screen.getByText('Logout')).toBeTruthy();
  });

  it('opens the Permissions screen straight from the dropdown', () => {
    // Permissions used to be buried inside the Security screen — reaching it
    // meant knowing it was there. It is its own dropdown entry now.
    openMenu();
    fireEvent.press(screen.getByText('Permissions'));
    expect(mockNavigate).toHaveBeenCalledWith('Permissions');
  });

  it('still routes Security to the account settings screen', () => {
    openMenu();
    fireEvent.press(screen.getByText('Security'));
    expect(mockNavigate).toHaveBeenCalledWith('AccountSettings');
  });
});
