import { UnauthorizedException } from '@nestjs/common';
import { GithubStrategy } from './github.strategy';

describe('GithubStrategy', () => {
  let strategy: GithubStrategy;

  beforeEach(() => {
    strategy = new GithubStrategy();
  });

  it('normalizes a valid GitHub profile', () => {
    const done = jest.fn();

    strategy.validate(
      'access-token',
      'refresh-token',
      {
        id: 'github-123',
        emails: [{ value: 'user@example.com' }],
      } as import('passport-github2').Profile,
      done,
    );

    expect(done).toHaveBeenCalledWith(null, {
      provider: 'github',
      providerAccountId: 'github-123',
      email: 'user@example.com',
    });
  });

  it('rejects when no email is returned (private/unverified email)', () => {
    const done = jest.fn();

    strategy.validate(
      'access-token',
      'refresh-token',
      { id: 'github-123', emails: [] } as unknown as import('passport-github2').Profile,
      done,
    );

    expect(done).toHaveBeenCalledWith(
      expect.any(UnauthorizedException),
      false,
    );
  });
});
