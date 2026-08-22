import { UnauthorizedException } from '@nestjs/common';
import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;

  beforeEach(() => {
    strategy = new GoogleStrategy();
  });

  it('normalizes a valid Google profile', () => {
    const done = jest.fn();

    strategy.validate(
      'access-token',
      'refresh-token',
      {
        id: 'google-123',
        emails: [{ value: 'user@example.com', verified: true }],
      } as import('passport-google-oauth20').Profile,
      done,
    );

    expect(done).toHaveBeenCalledWith(null, {
      provider: 'google',
      providerAccountId: 'google-123',
      email: 'user@example.com',
    });
  });

  it('rejects when no email is returned', () => {
    const done = jest.fn();

    strategy.validate(
      'access-token',
      'refresh-token',
      { id: 'google-123', emails: [] } as unknown as import('passport-google-oauth20').Profile,
      done,
    );

    expect(done).toHaveBeenCalledWith(
      expect.any(UnauthorizedException),
      false,
    );
  });

  it('rejects an unverified Google email', () => {
    const done = jest.fn();

    strategy.validate(
      'access-token',
      'refresh-token',
      {
        id: 'google-123',
        emails: [{ value: 'user@example.com', verified: false }],
      } as import('passport-google-oauth20').Profile,
      done,
    );

    expect(done).toHaveBeenCalledWith(
      expect.any(UnauthorizedException),
      false,
    );
  });
});
