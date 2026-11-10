import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AttachMenu } from '../AttachMenu';

const noopSticker = jest.fn();

describe('AttachMenu', () => {
  it('shows Emoji, Stickers, Photo, Video, Camera', () => {
    render(
      <AttachMenu
        onPickMedia={jest.fn()}
        onPickEmoji={jest.fn()}
        onPickStickerEmoji={noopSticker}
        onPickCustomSticker={noopSticker}
      />,
    );

    expect(screen.getByLabelText('Emoji')).toBeTruthy();
    expect(screen.getByLabelText('Stickers')).toBeTruthy();
    expect(screen.getByLabelText('Photo')).toBeTruthy();
    expect(screen.getByLabelText('Video')).toBeTruthy();
    expect(screen.getByLabelText('Camera')).toBeTruthy();
    expect(screen.getByLabelText('Record')).toBeTruthy();
  });

  it('calls onPickMedia with the right option for Photo/Video/Camera', () => {
    const onPickMedia = jest.fn();
    render(
      <AttachMenu
        onPickMedia={onPickMedia}
        onPickEmoji={jest.fn()}
        onPickStickerEmoji={noopSticker}
        onPickCustomSticker={noopSticker}
      />,
    );

    fireEvent.press(screen.getByLabelText('Photo'));
    expect(onPickMedia).toHaveBeenCalledWith('photo');

    fireEvent.press(screen.getByLabelText('Video'));
    expect(onPickMedia).toHaveBeenCalledWith('video');

    fireEvent.press(screen.getByLabelText('Camera'));
    expect(onPickMedia).toHaveBeenCalledWith('camera');

    fireEvent.press(screen.getByLabelText('Record'));
    expect(onPickMedia).toHaveBeenCalledWith('record');
  });

  it('switches to the emoji picker when Emoji is pressed, and back via the arrow', () => {
    render(
      <AttachMenu
        onPickMedia={jest.fn()}
        onPickEmoji={jest.fn()}
        onPickStickerEmoji={noopSticker}
        onPickCustomSticker={noopSticker}
      />,
    );

    fireEvent.press(screen.getByLabelText('Emoji'));
    expect(screen.getByText('😀')).toBeTruthy();
    expect(screen.queryByLabelText('Photo')).toBeNull();

    fireEvent.press(screen.getByLabelText('Back to attach options'));
    expect(screen.getByLabelText('Photo')).toBeTruthy();
  });

  it('calls onPickEmoji with the pressed emoji', () => {
    const onPickEmoji = jest.fn();
    render(
      <AttachMenu
        onPickMedia={jest.fn()}
        onPickEmoji={onPickEmoji}
        onPickStickerEmoji={noopSticker}
        onPickCustomSticker={noopSticker}
      />,
    );

    fireEvent.press(screen.getByLabelText('Emoji'));
    fireEvent.press(screen.getByText('🔥'));

    expect(onPickEmoji).toHaveBeenCalledWith('🔥');
  });

  it('opens stickers and sends a built-in sticker emoji', () => {
    const onPickStickerEmoji = jest.fn();
    render(
      <AttachMenu
        onPickMedia={jest.fn()}
        onPickEmoji={jest.fn()}
        onPickStickerEmoji={onPickStickerEmoji}
        onPickCustomSticker={noopSticker}
      />,
    );

    fireEvent.press(screen.getByLabelText('Stickers'));
    fireEvent.press(screen.getByLabelText('Sticker 🔥'));
    expect(onPickStickerEmoji).toHaveBeenCalledWith('🔥');
  });
});
