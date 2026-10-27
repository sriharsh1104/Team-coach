import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AttachMenu } from '../AttachMenu';

describe('AttachMenu', () => {
  it('shows the four options: Emoji, Photo, Video, Camera', () => {
    render(<AttachMenu onPickMedia={jest.fn()} onPickEmoji={jest.fn()} />);

    expect(screen.getByLabelText('Emoji')).toBeTruthy();
    expect(screen.getByLabelText('Photo')).toBeTruthy();
    expect(screen.getByLabelText('Video')).toBeTruthy();
    expect(screen.getByLabelText('Camera')).toBeTruthy();
  });

  it('calls onPickMedia with the right option for Photo/Video/Camera', () => {
    const onPickMedia = jest.fn();
    render(<AttachMenu onPickMedia={onPickMedia} onPickEmoji={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('Photo'));
    expect(onPickMedia).toHaveBeenCalledWith('photo');

    fireEvent.press(screen.getByLabelText('Video'));
    expect(onPickMedia).toHaveBeenCalledWith('video');

    fireEvent.press(screen.getByLabelText('Camera'));
    expect(onPickMedia).toHaveBeenCalledWith('camera');
  });

  it('switches to the emoji picker when Emoji is pressed, and back via the arrow', () => {
    render(<AttachMenu onPickMedia={jest.fn()} onPickEmoji={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('Emoji'));
    expect(screen.getByText('😀')).toBeTruthy();
    expect(screen.queryByLabelText('Photo')).toBeNull();

    fireEvent.press(screen.getByLabelText('Back to attach options'));
    expect(screen.getByLabelText('Photo')).toBeTruthy();
  });

  it('calls onPickEmoji with the pressed emoji', () => {
    const onPickEmoji = jest.fn();
    render(<AttachMenu onPickMedia={jest.fn()} onPickEmoji={onPickEmoji} />);

    fireEvent.press(screen.getByLabelText('Emoji'));
    fireEvent.press(screen.getByText('🔥'));

    expect(onPickEmoji).toHaveBeenCalledWith('🔥');
  });
});
