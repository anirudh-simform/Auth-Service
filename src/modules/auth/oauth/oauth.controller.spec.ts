import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { OAuthController } from './oauth.controller';
import { AuthService } from '../auth.service';
import { RequireTermsAcceptedGuard } from '../guards/require-terms-accepted/require-terms-accepted.guard';
import { NormalizedOAuthProfile } from './types/normalized-oauth-profile';

describe('OAuthController', () => {
  let controller: OAuthController;

  const authServiceMock = {
    loginWithOAuth: jest.fn(),
  };

  const profile: NormalizedOAuthProfile = {
    provider: 'google',
    providerAccountId: 'provider-account-1',
    email: 'user@example.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    })
      .overrideGuard(RequireTermsAcceptedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PassportAuthGuard('google'))
      .useValue({ canActivate: () => true })
      .overrideGuard(PassportAuthGuard('github'))
      .useValue({ canActivate: () => true })
      .overrideGuard(PassportAuthGuard('microsoft'))
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OAuthController>(OAuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('googleCallback delegates the normalized profile to loginWithOAuth', async () => {
    await controller.googleCallback(profile, 'chrome', '1.1.1.1');

    expect(authServiceMock.loginWithOAuth).toHaveBeenCalledWith(
      profile,
      'chrome',
      '1.1.1.1',
    );
  });

  it('githubCallback delegates the normalized profile to loginWithOAuth', async () => {
    await controller.githubCallback(profile, 'chrome', '1.1.1.1');

    expect(authServiceMock.loginWithOAuth).toHaveBeenCalledWith(
      profile,
      'chrome',
      '1.1.1.1',
    );
  });

  it('microsoftCallback delegates the normalized profile to loginWithOAuth', async () => {
    await controller.microsoftCallback(profile, 'chrome', '1.1.1.1');

    expect(authServiceMock.loginWithOAuth).toHaveBeenCalledWith(
      profile,
      'chrome',
      '1.1.1.1',
    );
  });
});
