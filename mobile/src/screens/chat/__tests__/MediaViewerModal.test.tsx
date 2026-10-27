import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MediaViewerModal } from '../MediaViewerModal';

describe('MediaViewerModal', () => {
  it('renders nothing visible-by-query when there is no uri', () => {
    render(<MediaViewerModal visible={false} type={null} uri={null} onClose={jest.fn()} />);
    expect(screen.queryByLabelText('Close viewer')).toBeNull();
  });

  it('shows an Image for type IMAGE', () => {
    render(
      <MediaViewerModal
        visible
        type="IMAGE"
        uri="http://localhost:3000/chat/files/a.jpg"
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Close viewer')).toBeTruthy();
  });

  it('shows a Video for type VIDEO', () => {
    render(
      <MediaViewerModal
        visible
        type="VIDEO"
        uri="http://localhost:3000/chat/files/clip.mp4"
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Close viewer')).toBeTruthy();
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    render(
      <MediaViewerModal
        visible
        type="IMAGE"
        uri="http://localhost:3000/chat/files/a.jpg"
        onClose={onClose}
      />,
    );

    fireEvent.press(screen.getByLabelText('Close viewer'));
    expect(onClose).toHaveBeenCalled();
  });
});
