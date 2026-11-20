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

  it('explains proxy 413 (HTML body, no JSON message)', () => {
    expect(
      apiErrorMessage({ response: { status: 413, data: '<html>413</html>' } }, 'Upload failed'),
    ).toMatch(/too large/i);
  });

  it('explains gateway errors and timeouts', () => {
    expect(apiErrorMessage({ response: { status: 504, data: '' } })).toMatch(/timed out/i);
    expect(apiErrorMessage({ response: { status: 502, data: '' } })).toMatch(/unavailable/i);
    expect(apiErrorMessage({ code: 'ECONNABORTED', message: 'timeout of 60000ms exceeded' })).toMatch(
      /timed out/i,
    );
  });

  it('includes the HTTP status in the generic fallback', () => {
    expect(apiErrorMessage({ response: { status: 500, data: '' } }, 'Upload failed')).toBe(
      'Upload failed (HTTP 500)',
    );
  });

  it('uses the provided fallback when nothing else is available', () => {
    expect(apiErrorMessage({}, 'Login failed')).toBe('Login failed');
  });
});
