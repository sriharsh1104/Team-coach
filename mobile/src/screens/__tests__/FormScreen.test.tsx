import React from 'react';
import { Platform, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { FormScreen } from '../FormScreen';

describe('FormScreen', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    (Platform as any).OS = originalOS;
  });

  it('renders its children', () => {
    render(
      <FormScreen>
        <Text>Form content</Text>
      </FormScreen>,
    );

    expect(screen.getByText('Form content')).toBeTruthy();
  });

  it('renders on Android without crashing (KeyboardAvoidingView behavior differs per platform)', () => {
    (Platform as any).OS = 'android';
    render(
      <FormScreen>
        <Text>Android form</Text>
      </FormScreen>,
    );

    expect(screen.getByText('Android form')).toBeTruthy();
  });
});
