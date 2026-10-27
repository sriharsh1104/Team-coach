import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RoleSelector } from '../RoleSelector';

describe('RoleSelector', () => {
  it('renders all three role options', () => {
    render(<RoleSelector value="PLAYER" onChange={jest.fn()} />);

    expect(screen.getByText('Player')).toBeTruthy();
    expect(screen.getByText('Coach')).toBeTruthy();
    expect(screen.getByText('Analyst')).toBeTruthy();
  });

  it('calls onChange with the pressed role', () => {
    const onChange = jest.fn();
    render(<RoleSelector value="PLAYER" onChange={onChange} />);

    fireEvent.press(screen.getByText('Coach'));
    expect(onChange).toHaveBeenCalledWith('COACH');

    fireEvent.press(screen.getByText('Analyst'));
    expect(onChange).toHaveBeenCalledWith('ANALYST');
  });
});
