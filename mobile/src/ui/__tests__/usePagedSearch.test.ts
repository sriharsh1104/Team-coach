import { matchesPersonQuery } from '../usePagedSearch';

describe('matchesPersonQuery', () => {
  it('matches name, email, and in-game name', () => {
    const person = {
      name: 'Alpha Player',
      email: 'alpha@team.com',
      inGameName: 'SES-ALPHA',
    };
    expect(matchesPersonQuery('alpha', person)).toBe(true);
    expect(matchesPersonQuery('team.com', person)).toBe(true);
    expect(matchesPersonQuery('ses-alpha', person)).toBe(true);
    expect(matchesPersonQuery('zzz', person)).toBe(false);
  });

  it('treats empty query as a match', () => {
    expect(matchesPersonQuery('', { name: 'X' })).toBe(true);
  });
});
