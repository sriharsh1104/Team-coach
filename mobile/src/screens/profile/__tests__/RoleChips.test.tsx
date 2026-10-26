import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RoleChips } from '../RoleChips';

describe('RoleChips', () => {
  it('renders every role option', () => {
    render(<RoleChips selected={[]} onToggle={jest.fn()} />);
    expect(screen.getByText('IGL')).toBeTruthy();
    expect(screen.getByText('Sniper')).toBeTruthy();
    expect(screen.getByText('Grenadier')).toBeTruthy();
  });

  it('calls onToggle with the role key (not the display label) when tapped', () => {
    const onToggle = jest.fn();
    render(<RoleChips selected={[]} onToggle={onToggle} />);
    fireEvent.press(screen.getByText('Sniper'));
    expect(onToggle).toHaveBeenCalledWith('SNIPER');
  });

  it('does not call onToggle when editable is false', () => {
    const onToggle = jest.fn();
    render(<RoleChips selected={[]} onToggle={onToggle} editable={false} />);
    fireEvent.press(screen.getByText('Sniper'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
