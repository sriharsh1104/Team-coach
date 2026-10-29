import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ScrimsListScreen } from '../ScrimsListScreen';

describe('ScrimsListScreen', () => {
  it('redirects into Stats → Scrims (hub lives under Stats now)', async () => {
    const navigation = { replace: jest.fn() } as any;
    render(<ScrimsListScreen navigation={navigation} route={{} as any} />);

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('Stats', { mode: 'SCRIM' }),
    );
  });
});
