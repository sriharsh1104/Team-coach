import { apiErrorMessage } from '../apiErrorMessage';

describe('apiErrorMessage', () => {
  it('reads a Nest string message', () => {
    expect(
      apiErrorMessage({ response: { data: { message: 'Invalid email or password' } } }),
    ).toBe('Invalid email or password');
  });

  it('joins Nest validation arrays', () => {
    expect(
      apiErrorMessage({
        response: { data: { message: ['email must be an email', 'password must be a string'] } },
      }),
    ).toBe('email must be an email, password must be a string');
  });

  it('falls back for network errors', () => {
    expect(apiErrorMessage({ message: 'Network Error' })).toBe('Network Error');
  });

  it('uses the provided fallback when nothing else is available', () => {
    expect(apiErrorMessage({}, 'Login failed')).toBe('Login failed');
  });
});
