import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { OtpBoxes } from '../OtpBoxes';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <OtpBoxes value={value} onChange={setValue} />;
}

describe('OtpBoxes', () => {
  it('renders six digit cells', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Digit 1 of 6')).toBeTruthy();
    expect(screen.getByLabelText('Digit 6 of 6')).toBeTruthy();
  });

  it('accepts a pasted 6-digit code into the first cell', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Digit 1 of 6'), '482915');
    expect(screen.getByLabelText('Digit 1 of 6').props.value).toBe('4');
    expect(screen.getByLabelText('Digit 6 of 6').props.value).toBe('5');
  });
});
