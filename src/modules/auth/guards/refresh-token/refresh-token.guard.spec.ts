import { RefreshTokenGuard } from './refresh-token.guard';
import { SessionService } from 'src/modules/session/session.service';

describe('RefreshTokenGuard', () => {
  it('should be defined', () => {
    const sessionServiceMock = {} as SessionService;
    expect(new RefreshTokenGuard(sessionServiceMock)).toBeDefined();
  });
});
