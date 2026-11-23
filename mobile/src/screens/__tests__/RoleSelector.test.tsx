import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { RoleSelector } from '../RoleSelector';
import { confirmAsync } from '../../ui/confirmAsync';

jest.mock('../../ui/confirmAsync', () => ({
  confirmAsync: jest.fn(async () => true),
}));

const mockedConfirm = confirmAsync as jest.MockedFunction<typeof confirmAsync>;

describe('RoleSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedConfirm.mockResolvedValue(true);
  });

  it('shows the current role as a compact trigger (not all three pills)', () => {
    render(<RoleSelector value="PLAYER" onChange={jest.fn()} />);

    expect(screen.getByText('Player')).toBeTruthy();
    expect(screen.queryByText('Coach')).toBeNull();
    expect(screen.queryByText('Analyst')).toBeNull();
  });

  it('opens a picker and confirms before calling onChange', async () => {
    const onChange = jest.fn();
    render(
      <RoleSelector value="PLAYER" memberName="Teammate" onChange={onChange} />,
    );

    fireEvent.press(screen.getByLabelText('Change role, currently Player'));
    expect(screen.getByText('Select Role')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select Coach'));
    });

    expect(mockedConfirm).toHaveBeenCalledWith(
      'Change Role',
      'Make Teammate a Coach?',
      'Change',
      'Cancel',
      false,
    );
    expect(onChange).toHaveBeenCalledWith('COACH');
  });

  it('skips confirm when confirmBeforeChange is false', async () => {
    const onChange = jest.fn();
    render(
      <RoleSelector
        value="PLAYER"
        confirmBeforeChange={false}
        onChange={onChange}
      />,
    );

    fireEvent.press(screen.getByLabelText('Change role, currently Player'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select Analyst'));
    });

    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('ANALYST');
  });

  it('does not call onChange when confirm is cancelled', async () => {
    mockedConfirm.mockResolvedValue(false);
    const onChange = jest.fn();
    render(<RoleSelector value="PLAYER" onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Change role, currently Player'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select Coach'));
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
