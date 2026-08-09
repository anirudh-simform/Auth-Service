import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SessionService } from './session.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';

describe('SessionService', () => {
  let service: SessionService;

  const prismaMock = {
    userSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const auditLogServiceMock = {
    record: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('revokeSingleSession', () => {
    it('revokes the session when it belongs to the calling user', async () => {
      prismaMock.userSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.revokeSingleSession(
        'session-1',
        'user-1',
      );

      expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', user_id: 'user-1' },
        data: { revoked_at: expect.any(Date) },
      });
      expect(result).toEqual({ message: 'User session revoked' });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.SESSION_REVOKED,
          actorUserId: 'user-1',
          targetType: 'UserSession',
          targetId: 'session-1',
        }),
      );
    });

    it('rejects revoking a session belonging to a different user (cross-user/cross-tenant attack)', async () => {
      // updateMany's where clause includes the caller's own id, so a session
      // owned by someone else never matches - simulated here by count: 0.
      prismaMock.userSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revokeSingleSession('session-owned-by-someone-else', 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-owned-by-someone-else', user_id: 'user-1' },
        data: { revoked_at: expect.any(Date) },
      });
      expect(auditLogServiceMock.record).not.toHaveBeenCalled();
    });
  });

  describe('getAllSessions', () => {
    it('scopes the listing to the requesting user only', async () => {
      prismaMock.userSession.findMany.mockResolvedValue([]);

      await service.getAllSessions('user-1', 2, 10);

      expect(prismaMock.userSession.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        skip: 10,
        take: 10,
        orderBy: { updated_at: 'desc' },
      });
    });

    it('never returns another user’s sessions even if requested', async () => {
      prismaMock.userSession.findMany.mockImplementation(({ where }) =>
        Promise.resolve(
          [
            { id: 's1', user_id: 'user-1' },
            { id: 's2', user_id: 'user-2' },
          ].filter((session) => session.user_id === where.user_id),
        ),
      );

      const result = await service.getAllSessions('user-1');

      expect(result).toEqual([{ id: 's1', user_id: 'user-1' }]);
    });
  });

  describe('revokeAllSessionsForUser', () => {
    it('revokes only sessions belonging to the given user and records an audit event', async () => {
      prismaMock.userSession.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.revokeAllSessionsForUser('user-1');

      expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        data: { revoked_at: expect.any(Date) },
      });
      expect(result).toEqual({ message: '3 sessions revoked' });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.SESSION_ALL_REVOKED,
          actorUserId: 'user-1',
          metadata: { revokedCount: 3 },
        }),
      );
    });

    it('throws NotFoundException when the user has no sessions', async () => {
      prismaMock.userSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revokeAllSessionsForUser('user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
