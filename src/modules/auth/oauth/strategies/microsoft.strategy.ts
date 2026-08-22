import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
// passport-microsoft ships no type declarations - resolves as `any` (noImplicitAny is off for this repo)
import { Strategy } from 'passport-microsoft';
import { config } from 'src/config';
import { NormalizedOAuthProfile } from '../types/normalized-oauth-profile';

interface MicrosoftProfile {
  id: string;
  emails?: Array<{ type: string; value: string }>;
}

type MicrosoftVerifyCallback = (
  error: Error | null,
  user?: NormalizedOAuthProfile | false,
) => void;

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor() {
    const mockBase = config.OAUTH_MOCK_BASE_URL;
    super({
      clientID: config.MICROSOFT_CLIENT_ID,
      clientSecret: config.MICROSOFT_CLIENT_SECRET,
      callbackURL: config.MICROSOFT_CALLBACK_URL,
      scope: ['user.read'],
      // Falls back to the user principal name when `mail` is unset - common for personal accounts
      addUPNAsEmail: true,
      ...(mockBase && {
        authorizationURL: `${mockBase}/microsoft/authorize`,
        tokenURL: `${mockBase}/microsoft/token`,
        // MicrosoftStrategy builds the profile URL as `${apiEntryPoint}/${graphApiVersion}/me/`
        apiEntryPoint: mockBase,
      }),
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: MicrosoftProfile,
    done: MicrosoftVerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(
        new UnauthorizedException(
          'Microsoft did not return an email address for this account',
        ),
        false,
      );
      return;
    }

    const normalized: NormalizedOAuthProfile = {
      provider: 'microsoft',
      providerAccountId: profile.id,
      email,
    };

    done(null, normalized);
  }
}
