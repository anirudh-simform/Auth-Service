import { Test } from '@nestjs/testing';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from '../authorization.service';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';

describe('AuthorizationGuard', () => {
  let authorizationGuard: AuthorizationGuard;

  const authorizationServiceMock = {
    isUserAuthorized: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthorizationGuard,
        { provide: AuthorizationService, useValue: authorizationServiceMock },
      ],
    }).compile();
    authorizationGuard = moduleRef.get(AuthorizationGuard);
  });

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
});
