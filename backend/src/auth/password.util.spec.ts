import { PASSWORD_REGEX, generateRandomPassword } from './password.util';

describe('generateRandomPassword', () => {
  it('always returns exactly 8 chars matching signup password rules', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generateRandomPassword();
      expect(password).toHaveLength(8);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/\d/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
      expect(PASSWORD_REGEX.test(password)).toBe(true);
    }
  });
});
