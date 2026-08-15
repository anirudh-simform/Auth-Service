jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: jest.fn(),
}));

import * as argon2 from 'argon2';
jest.mock('argon2');
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/common/email/email.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';
import { SessionService } from '../session/session.service';
import { AuthorizationService } from '../authorization/authorization.service';

describe('AuthService', () => {
  let authService: AuthService;

  const txMock = {
    magicLink: { deleteMany: jest.fn() },
    userSession: { deleteMany: jest.fn() },
    orgMembership: { deleteMany: jest.fn() },
    user: { delete: jest.fn() },
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    orgMembership: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    ),
  };

  const auditLogServiceMock = {
    record: jest.fn(),
    listForActor: jest.fn(),
  };

  const sessionServiceMock = {
    createUserSession: jest.fn(),
    invalidateSession: jest.fn(),
    getAllSessions: jest.fn(),
  };

  const authorizationServiceMock = {
    isOwnerRole: jest.fn(),
  };

  const emailServiceMock = {
    sendEmailVerificationLink: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
        { provide: SessionService, useValue: sessionServiceMock },
        { provide: AuthorizationService, useValue: authorizationServiceMock },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('User login', () => {
    const ip = '1.1.1.1';
    it('should throw not found exception when user does not exist', async () => {
      prismaMock.user.findUnique.mockReturnValueOnce(null);
      await expect(
        authService.login('dummy@gmail.com', 'password', ip, 'chrome'),
      ).rejects.toThrow('User not found. Please register first');
    });

    it('should throw conflict exception when email not verified', async () => {
      prismaMock.user.findUnique.mockReturnValueOnce({
        id: 1,
        password_hash: 'string',
        is_email_verified: false,
      });
      await expect(
        authService.login('dummy@gmail.com', 'password', ip, 'chrome'),
      ).rejects.toThrow(
        'Email not verified, please verify email before logging in',
      );
    });

    it('should throw bad request exception when password not correct', async () => {
      // get correct user object
      prismaMock.user.findUnique.mockReturnValueOnce({
        id: 1,
        password_hash: 'string',
        is_email_verified: true,
      });

      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login('dummy@gmail.com', 'password', ip, 'chrome'),
      ).rejects.toThrow('Wrong email or password');
    });
  });

  describe('me: User profile retrieval', () => {
    it('should throw not found exception when user does not exist', async () => {
      prismaMock.user.findUnique.mockReturnValueOnce(null);
      await expect(authService.me(1)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });

    it('should throw conflict exception when email not verified', async () => {
      prismaMock.user.findUnique.mockReturnValueOnce({
        id: 1,
        password_hash: 'string',
        is_email_verified: false,
      });
      await expect(authService.me(1)).rejects.toThrow(
        new ForbiddenException('Email not verified: Cannot access profile'),
      );
    });
  });

  describe('deleteAccount', () => {
    it('throws BadRequestException when the password is wrong', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        password_hash: 'hash',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.deleteAccount('user-1', 'wrong-password'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the user owns an organization', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ password_hash: 'hash' });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      prismaMock.orgMembership.findMany.mockResolvedValue([
        { orgRole: { is_system: true, role_name: 'Owner' } },
      ]);
      authorizationServiceMock.isOwnerRole.mockReturnValue(true);

      await expect(
        authService.deleteAccount('user-1', 'correct-password'),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('deletes the account and records an audit event on the happy path', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ password_hash: 'hash' });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      prismaMock.orgMembership.findMany.mockResolvedValue([]);

      const result = await authService.deleteAccount(
        'user-1',
        'correct-password',
      );

      expect(txMock.magicLink.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
      });
      expect(txMock.userSession.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
      });
      expect(txMock.orgMembership.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
      });
      expect(txMock.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.USER_ACCOUNT_DELETED,
          actorUserId: 'user-1',
          targetId: 'user-1',
        }),
      );
      expect(result).toEqual({ message: 'Account deleted successfully' });
    });
  });

  describe('exportMyData', () => {
    it('aggregates profile, memberships, sessions and audit events, and strips refresh_token_hash', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      });
      prismaMock.orgMembership.findMany.mockResolvedValue([
        {
          org: { id: 'org-1', name: 'Acme' },
          orgRole: { role_name: 'Admin' },
        },
      ]);
      sessionServiceMock.getAllSessions.mockResolvedValue([
        { id: 'session-1', refresh_token_hash: 'secret-hash', ip_address: '1.1.1.1' },
      ]);
      auditLogServiceMock.listForActor.mockResolvedValue([
        { event_type: 'AUTH_LOGIN_SUCCESS' },
      ]);

      const result = await authService.exportMyData('user-1');

      expect(result.profile).toEqual({ id: 'user-1', email: 'user@example.com' });
      expect(result.organizationMemberships).toEqual([
        { organizationId: 'org-1', organizationName: 'Acme', roleName: 'Admin' },
      ]);
      expect(result.sessions).toEqual([
        { id: 'session-1', ip_address: '1.1.1.1' },
      ]);
      expect(result.sessions[0]).not.toHaveProperty('refresh_token_hash');
      expect(result.auditEvents).toEqual([
        { event_type: 'AUTH_LOGIN_SUCCESS' },
      ]);
      expect(auditLogServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.USER_DATA_EXPORTED,
          actorUserId: 'user-1',
        }),
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.orgMembership.findMany.mockResolvedValue([]);
      sessionServiceMock.getAllSessions.mockResolvedValue([]);
      auditLogServiceMock.listForActor.mockResolvedValue([]);

      await expect(authService.exportMyData('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('register: consent tracking', () => {
    it('stamps terms_accepted_at when creating a new user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const upsertMock = jest.fn().mockResolvedValue({ id: 'user-1' });
      const transactionPrisma = { user: { upsert: upsertMock }, magicLink: { create: jest.fn() } };
      (prismaMock as unknown as { $transaction: jest.Mock }).$transaction = jest
        .fn()
        .mockImplementation((callback: (tx: typeof transactionPrisma) => unknown) =>
          callback(transactionPrisma),
        );

      await authService.register('new@example.com', 'password123');

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            terms_accepted_at: expect.any(Date),
          }),
          update: expect.objectContaining({
            terms_accepted_at: expect.any(Date),
          }),
        }),
      );
    });
  });
});
