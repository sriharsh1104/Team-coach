import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PointsCalculatorModal } from '../PointsCalculatorModal';

jest.mock('../../../data/pointsCalcStorage', () => ({
  loadCalcTables: jest.fn().mockResolvedValue([{ id: 't1', matches: [{ rank: null, kills: 0 }] }]),
  saveCalcTables: jest.fn().mockResolvedValue(undefined),
}));

function setup() {
  const onSendToChat = jest.fn();
  const onClose = jest.fn();
  render(<PointsCalculatorModal visible onClose={onClose} onSendToChat={onSendToChat} />);
  return { onSendToChat, onClose };
}

describe('PointsCalculatorModal', () => {
  it('scores per match + total, and "Add match" stays inside the same table', async () => {
    const { onSendToChat, onClose } = setup();

    // Match 1: 3rd (8) + 5 kills = 13
    fireEvent.press(screen.getByLabelText('Table 1 match 1 placement 3'));
    for (let i = 0; i < 5; i++) fireEvent.press(screen.getByLabelText('More kills table 1 match 1'));
    await waitFor(() => expect(screen.getByLabelText('Table 1 total 13 points')).toBeTruthy());

    // Match 2 in the SAME table: Booyah (12) + 2 kills = 14 → total 27
    fireEvent.press(screen.getByLabelText('Add match to table 1'));
    fireEvent.press(screen.getByLabelText('Table 1 match 2 placement 1'));
    fireEvent.press(screen.getByLabelText('More kills table 1 match 2'));
    fireEvent.press(screen.getByLabelText('More kills table 1 match 2'));
    await waitFor(() => expect(screen.getByLabelText('Table 1 total 27 points')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Send table 1 to chat'));
    const text = onSendToChat.mock.calls[0][0] as string;
    expect(text).toContain('Points Table 1');
    expect(text).toContain('Match 1: 3rd · 5 kills = 13 pts');
    expect(text).toContain('Match 2: 1st · 2 kills = 14 pts');
    expect(text).toContain('Total: 27 pts');
    expect(onClose).toHaveBeenCalled();
  });

  it('chat "Add match" seed keeps prior matches and only appends the next empty slot', async () => {
    const onSendToChat = jest.fn();
    const onClose = jest.fn();
    render(
      <PointsCalculatorModal
        visible
        onClose={onClose}
        onSendToChat={onSendToChat}
        seed={{ title: 'Scrim A', matches: [{ rank: 3, kills: 5 }] }}
      />,
    );

    // Match 1 from the chat bubble is already filled; Match 2 is the empty slot.
    await waitFor(() => expect(screen.getByLabelText('Table 1 total 13 points')).toBeTruthy());
    expect(screen.getByLabelText('Table 1 match 1 placement 3')).toBeTruthy();
    expect(screen.getByLabelText('Table 1 match 2 placement 1')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Table 1 match 2 placement 1'));
    fireEvent.press(screen.getByLabelText('More kills table 1 match 2'));
    fireEvent.press(screen.getByLabelText('More kills table 1 match 2'));
    await waitFor(() => expect(screen.getByLabelText('Table 1 total 27 points')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Send table 1 to chat'));
    const text = onSendToChat.mock.calls[0][0] as string;
    expect(text).toContain('Scrim A');
    expect(text).toContain('Match 1: 3rd · 5 kills = 13 pts');
    expect(text).toContain('Match 2: 1st · 2 kills = 14 pts');
    expect(text).toContain('Total: 27 pts');
  });

  it('"New points table" starts a separate table that never joins the previous total', async () => {
    setup();

    fireEvent.press(screen.getByLabelText('Table 1 match 1 placement 1'));
    await waitFor(() => expect(screen.getByLabelText('Table 1 total 12 points')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('New points table'));
    // Table 2 starts at 0 and Table 1 keeps its own total.
    await waitFor(() => expect(screen.getByLabelText('Table 2 total 0 points')).toBeTruthy());
    expect(screen.getByLabelText('Table 1 total 12 points')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Table 2 match 1 placement 2'));
    await waitFor(() => expect(screen.getByLabelText('Table 2 total 9 points')).toBeTruthy());
    expect(screen.getByLabelText('Table 1 total 12 points')).toBeTruthy();

    // Adding a match to table 1 doesn't touch table 2.
    fireEvent.press(screen.getByLabelText('Add match to table 1'));
    fireEvent.press(screen.getByLabelText('Table 1 match 2 placement 3'));
    await waitFor(() => expect(screen.getByLabelText('Table 1 total 20 points')).toBeTruthy());
    expect(screen.getByLabelText('Table 2 total 9 points')).toBeTruthy();
  });
});
