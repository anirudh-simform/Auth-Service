import { Test, TestingModule } from '@nestjs/testing';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { AuthGuard } from '../auth/guards/auth/auth.guard';
import { User } from 'src/generated/prisma/client';

describe('SessionController', () => {
  let controller: SessionController;

  const sessionServiceMock = {
    getAllSessions: jest.fn(),
    revokeSingleSession: jest.fn(),
    revokeAllSessionsForUser: jest.fn(),
  };

  const user = { id: 'user-1' } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [{ provide: SessionService, useValue: sessionServiceMock }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SessionController>(SessionController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getAllSessions scopes the listing to the authenticated user', async () => {
    await controller.getAllSessions(user, { page: 2, limit: 5 });

    expect(sessionServiceMock.getAllSessions).toHaveBeenCalledWith(
      'user-1',
      2,
      5,
    );
  });

  it('revokeSingleSession passes the authenticated user as the ownership check', async () => {
    await controller.revokeSingleSession(user, { sessionId: 'session-1' });

    expect(sessionServiceMock.revokeSingleSession).toHaveBeenCalledWith(
      'session-1',
      'user-1',
    );
  });

  it('revokeAllSessionsForUser scopes revocation to the authenticated user', async () => {
    await controller.revokeAllSessionsForUser(user);

    expect(sessionServiceMock.revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-1',
    );
  });
});
