import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HeaderSettingsButton } from '../HeaderSettingsButton';
import { ThemeProvider } from '../../theme/ThemeContext';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HeaderSettingsButton', () => {
  it('opens the Settings hub from the gear', () => {
    render(
      <ThemeProvider>
        <HeaderSettingsButton />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByLabelText('Account Settings'));
    expect(mockNavigate).toHaveBeenCalledWith('Settings');
  });
});
