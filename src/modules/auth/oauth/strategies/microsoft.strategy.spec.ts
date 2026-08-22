import { UnauthorizedException } from '@nestjs/common';
import { MicrosoftStrategy } from './microsoft.strategy';

describe('MicrosoftStrategy', () => {
  let strategy: MicrosoftStrategy;

  beforeEach(() => {
    strategy = new MicrosoftStrategy();
  });

  it('normalizes a valid Microsoft profile', () => {
    const done = jest.fn();

    strategy.validate(
      'access-token',
      'refresh-token',
      {
        id: 'microsoft-123',
        emails: [{ type: 'work', value: 'user@example.com' }],
      },
      done,
    );

    expect(done).toHaveBeenCalledWith(null, {
      provider: 'microsoft',
      providerAccountId: 'microsoft-123',
      email: 'user@example.com',
    });
  });

  it('rejects when no email is returned', () => {
    const done = jest.fn();

    strategy.validate(
      'access-token',
      'refresh-token',
      { id: 'microsoft-123', emails: [] },
      done,
    );

    expect(done).toHaveBeenCalledWith(
      expect.any(UnauthorizedException),
      false,
    );
  });
});
