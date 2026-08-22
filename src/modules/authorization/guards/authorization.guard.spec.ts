import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from '../authorization.service';

describe('AuthorizationGuard', () => {
  let authorizationGuard: AuthorizationGuard;

  const authorizationServiceMock = {
    isUserAuthorized: jest.fn(),
  };

  const reflectorMock = {
    getAllAndOverride: jest.fn().mockReturnValue('organization.read'),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthorizationGuard,
        { provide: AuthorizationService, useValue: authorizationServiceMock },
        { provide: Reflector, useValue: reflectorMock },
      ],
    }).compile();
    authorizationGuard = moduleRef.get(AuthorizationGuard);
  });

  const contextWithOrgId = (organizationId: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          params: { organizationId },
          user: { id: 'user-1' },
        }),
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(authorizationGuard).toBeDefined();
  });

  it('delegates to AuthorizationService.isUserAuthorized and propagates ForbiddenException', async () => {
    authorizationServiceMock.isUserAuthorized.mockRejectedValueOnce(
      new ForbiddenException('This action is forbidden to you'),
    );

    await expect(
      authorizationGuard.hasPermission(
        'org-1',
        'user-1',
        'organization.delete',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(authorizationServiceMock.isUserAuthorized).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      'organization.delete',
    );
  });

  it('returns true when the user has the permission', async () => {
    authorizationServiceMock.isUserAuthorized.mockResolvedValueOnce(true);

    await expect(
      authorizationGuard.hasPermission(
        'org-1',
        'user-1',
        'organization.delete',
      ),
    ).resolves.toBe(true);
  });

  it('wraps unexpected errors in an InternalServerErrorException', async () => {
    authorizationServiceMock.isUserAuthorized.mockRejectedValueOnce(
      new Error('db is down'),
    );

    await expect(
      authorizationGuard.hasPermission(
        'org-1',
        'user-1',
        'organization.delete',
      ),
    ).rejects.toThrow(InternalServerErrorException);
  });

  describe('canActivate', () => {
    it('rejects a malformed :organizationId with a 400 instead of hitting Prisma with it', async () => {
      await expect(
        authorizationGuard.canActivate(contextWithOrgId('not-a-uuid')),
      ).rejects.toThrow(BadRequestException);

      expect(authorizationServiceMock.isUserAuthorized).not.toHaveBeenCalled();
    });

    it('proceeds to isUserAuthorized when :organizationId is a valid UUID', async () => {
      authorizationServiceMock.isUserAuthorized.mockResolvedValueOnce(true);

      await expect(
        authorizationGuard.canActivate(
          contextWithOrgId('01a02960-4f81-73b7-bd4a-ee0b5297e202'),
        ),
      ).resolves.toBe(true);

      expect(authorizationServiceMock.isUserAuthorized).toHaveBeenCalledWith(
        'user-1',
        '01a02960-4f81-73b7-bd4a-ee0b5297e202',
        'organization.read',
      );
    });
  });
});
