import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { config } from 'src/config';
import { NormalizedOAuthProfile } from '../types/normalized-oauth-profile';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const mockBase = config.OAUTH_MOCK_BASE_URL;
    super({
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CALLBACK_URL,
      scope: ['email', 'profile'],
      ...(mockBase && {
        authorizationURL: `${mockBase}/google/authorize`,
        tokenURL: `${mockBase}/google/token`,
        userProfileURL: `${mockBase}/google/userinfo`,
      }),
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: import('passport-google-oauth20').Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0];

    if (!email) {
      done(
        new UnauthorizedException(
          'Google did not return an email address for this account',
        ),
        false,
      );
      return;
    }

    if (email.verified === false) {
      done(
        new UnauthorizedException('This Google account email is not verified'),
        false,
      );
      return;
    }

    const normalized: NormalizedOAuthProfile = {
      provider: 'google',
      providerAccountId: profile.id,
      email: email.value,
    };

    done(null, normalized);
  }
}
