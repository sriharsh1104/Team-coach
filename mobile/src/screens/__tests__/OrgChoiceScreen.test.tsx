import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { OrgChoiceScreen } from '../OrgChoiceScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext');

const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OrgChoiceScreen', () => {
  it("greets the user by name", () => {
    mockedUseAuth.mockReturnValue({ user: { name: 'Player One' }, logout: jest.fn() });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);
    expect(screen.getByText('Welcome, Player One')).toBeTruthy();
  });

  it('navigates to CreateOrg and JoinOrg', () => {
    mockedUseAuth.mockReturnValue({ user: { name: 'Player One' }, logout: jest.fn() });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);

    fireEvent.press(screen.getByText('Create an Org'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateOrg');

    fireEvent.press(screen.getByText('Join an Org'));
    expect(navigation.navigate).toHaveBeenCalledWith('JoinOrg');
  });

  it('calls logout when the link is pressed', () => {
    const logout = jest.fn();
    mockedUseAuth.mockReturnValue({ user: { name: 'Player One' }, logout });
    render(<OrgChoiceScreen navigation={navigation} route={{} as any} />);

    fireEvent.press(screen.getByText('Log Out'));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
