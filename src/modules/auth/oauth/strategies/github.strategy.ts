import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, Profile } from 'passport-github2';
import { VerifyCallback } from 'passport-oauth2';
import { config } from 'src/config';
import { NormalizedOAuthProfile } from '../types/normalized-oauth-profile';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor() {
    const mockBase = config.OAUTH_MOCK_BASE_URL;
    super({
      clientID: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_CLIENT_SECRET,
      callbackURL: config.GITHUB_CALLBACK_URL,
      // GitHub omits email from the profile unless this scope is requested
      scope: ['user:email'],
      ...(mockBase && {
        authorizationURL: `${mockBase}/github/authorize`,
        tokenURL: `${mockBase}/github/token`,
        userProfileURL: `${mockBase}/github/user`,
        userEmailURL: `${mockBase}/github/user/emails`,
      }),
    } as StrategyOptions);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(
        new UnauthorizedException(
          'GitHub did not return an email address for this account - make sure your GitHub email is public or verified',
        ),
        false,
      );
      return;
    }

    const normalized: NormalizedOAuthProfile = {
      provider: 'github',
      providerAccountId: profile.id,
      email,
    };

    done(null, normalized);
  }
}
