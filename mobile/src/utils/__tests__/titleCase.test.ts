import { titleCase } from '../titleCase';

describe('titleCase', () => {
  it('capitalizes the first letter of each word', () => {
    expect(titleCase('create your account')).toBe('Create Your Account');
    expect(titleCase('Sign in')).toBe('Sign In');
    expect(titleCase('IN CHANNEL')).toBe('In Channel');
  });

  it('trims and collapses whitespace', () => {
    expect(titleCase('  review   stats  ')).toBe('Review Stats');
  });
});
