import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  ScheduleDateTimeField,
  defaultEventTimeToPM,
} from '../ScheduleDateTimeField';

// Native date/time picker UI isn't under test here — only the date chip
// opens it, which these tests never do.
jest.mock('@react-native-community/datetimepicker', () => () => null);

function Harness({ initial }: { initial: Date }) {
  const [value, setValue] = React.useState(initial);
  return <ScheduleDateTimeField label="Date & Time" value={value} onChange={setValue} />;
}

describe('defaultEventTimeToPM', () => {
  it('leaves a PM time untouched', () => {
    const base = new Date(2026, 0, 1, 15, 30); // 3:30 PM
    const result = defaultEventTimeToPM(base);
    expect(result.getHours()).toBe(15);
    expect(result.getMinutes()).toBe(30);
  });

  it('shifts an AM time forward by 12 hours into PM', () => {
    const base = new Date(2026, 0, 1, 9, 15); // 9:15 AM
    const result = defaultEventTimeToPM(base);
    expect(result.getHours()).toBe(21); // 9:15 PM
    expect(result.getMinutes()).toBe(15);
    expect(result.getDate()).toBe(1); // same day, just later in it
  });

  it('treats noon (already PM in 24h terms) as unchanged', () => {
    const base = new Date(2026, 0, 1, 12, 0);
    const result = defaultEventTimeToPM(base);
    expect(result.getHours()).toBe(12);
  });
});

describe('ScheduleDateTimeField', () => {
  it('shows the hour, minute, and the correct active AM/PM option', () => {
    render(<Harness initial={new Date(2026, 0, 1, 14, 5)} />); // 2:05 PM

    expect(screen.getByDisplayValue('2')).toBeTruthy();
    expect(screen.getByDisplayValue('05')).toBeTruthy();
    expect(screen.getByText('Thu, Jan 1, 2026, 02:05 PM')).toBeTruthy();
  });

  it('switches to AM when AM is pressed, shifting the hour back 12 hours', () => {
    render(<Harness initial={new Date(2026, 0, 1, 14, 5)} />); // 2:05 PM

    fireEvent.press(screen.getByLabelText('Date & Time AM'));

    expect(screen.getByText(/02:05 AM/)).toBeTruthy();
  });

  it('switches to PM when PM is pressed from an AM time', () => {
    render(<Harness initial={new Date(2026, 0, 1, 2, 5)} />); // 2:05 AM

    fireEvent.press(screen.getByLabelText('Date & Time PM'));

    expect(screen.getByText(/02:05 PM/)).toBeTruthy();
  });

  it('updates the hour as the user types, clamping to 1-12 on blur', () => {
    render(<Harness initial={new Date(2026, 0, 1, 14, 5)} />);
    const hourInput = screen.getByLabelText('Date & Time Hour');

    fireEvent.changeText(hourInput, '7');
    expect(screen.getByText(/07:05 PM/)).toBeTruthy();

    fireEvent.changeText(hourInput, '15');
    fireEvent(hourInput, 'blur');
    // Clamped to 12 (the max valid 12-hour value).
    expect(screen.getByDisplayValue('12')).toBeTruthy();
  });

  it('updates the minute as the user types, clamping to 0-59 on blur', () => {
    render(<Harness initial={new Date(2026, 0, 1, 14, 5)} />);
    const minuteInput = screen.getByLabelText('Date & Time Minute');

    fireEvent.changeText(minuteInput, '45');
    expect(screen.getByText(/02:45 PM/)).toBeTruthy();

    fireEvent.changeText(minuteInput, '99');
    fireEvent(minuteInput, 'blur');
    expect(screen.getByDisplayValue('59')).toBeTruthy();
  });

  it('an empty hour falls back to 12 on blur rather than crashing', () => {
    render(<Harness initial={new Date(2026, 0, 1, 14, 5)} />);
    const hourInput = screen.getByLabelText('Date & Time Hour');

    fireEvent.changeText(hourInput, '');
    fireEvent(hourInput, 'blur');

    expect(screen.getByDisplayValue('12')).toBeTruthy();
  });
});
