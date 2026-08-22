import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { NormalizedOAuthProfile } from '../oauth/types/normalized-oauth-profile';

/**
 * Reads the profile a Passport strategy's validate() attached to req.user.
 * Isolated cast: the app-wide Request.user type (types/express.ts) stays
 * Omit<User, 'password_hash'> for every other route - only OAuth callback
 * handlers ever see a NormalizedOAuthProfile there.
 */
export const OAuthProfile = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): NormalizedOAuthProfile => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.user as unknown as NormalizedOAuthProfile;
  },
);
