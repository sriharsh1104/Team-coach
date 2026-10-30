import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { RuleBookScreen } from '../RuleBookScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RuleBookScreen', () => {
  it('shows tabs with per-section rule counts', async () => {
    render(<RuleBookScreen navigation={navigation} route={{} as any} />);

    expect(screen.getByText('12 rules')).toBeTruthy();
    expect(screen.getByText('Mindset & Discipline')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Gameplay'));
    });
    expect(screen.getByText('20 rules')).toBeTruthy();
    expect(screen.getByText('Gameplay & Practice')).toBeTruthy();
    // Gameplay renumbers from 1 (not 13).
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('does not include business / social contacts', () => {
    render(<RuleBookScreen navigation={navigation} route={{} as any} />);

    expect(screen.queryByText('Business')).toBeNull();
    expect(screen.queryByText('Social Handles')).toBeNull();
    expect(screen.queryByText('sacredesportsss@gmail.com')).toBeNull();
    expect(screen.queryByText('Scan to connect')).toBeNull();
  });
});
