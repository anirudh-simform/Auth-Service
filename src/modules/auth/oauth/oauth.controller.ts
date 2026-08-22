import { Controller, Get, Ip, UseGuards } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';
import { UserAgent } from '../decorators/user-agent.decorator';
import { OAuthProfile } from '../decorators/oauth-profile.decorator';
import { RequireTermsAcceptedGuard } from '../guards/require-terms-accepted/require-terms-accepted.guard';
import type { NormalizedOAuthProfile } from './types/normalized-oauth-profile';

@Controller('auth')
export class OAuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(RequireTermsAcceptedGuard, PassportAuthGuard('google'))
  googleLogin() {
    // Passport intercepts before this body runs and redirects to Google.
  }

  @Get('google/callback')
  @UseGuards(PassportAuthGuard('google'))
  async googleCallback(
    @OAuthProfile() profile: NormalizedOAuthProfile,
    @UserAgent() userAgent: string,
    @Ip() ip: string,
  ) {
    return await this.authService.loginWithOAuth(profile, userAgent, ip);
  }

  @Get('github')
  @UseGuards(RequireTermsAcceptedGuard, PassportAuthGuard('github'))
  githubLogin() {
    // Passport intercepts before this body runs and redirects to GitHub.
  }

  @Get('github/callback')
  @UseGuards(PassportAuthGuard('github'))
  async githubCallback(
    @OAuthProfile() profile: NormalizedOAuthProfile,
    @UserAgent() userAgent: string,
    @Ip() ip: string,
  ) {
    return await this.authService.loginWithOAuth(profile, userAgent, ip);
  }

  @Get('microsoft')
  @UseGuards(RequireTermsAcceptedGuard, PassportAuthGuard('microsoft'))
  microsoftLogin() {
    // Passport intercepts before this body runs and redirects to Microsoft.
  }

  @Get('microsoft/callback')
  @UseGuards(PassportAuthGuard('microsoft'))
  async microsoftCallback(
    @OAuthProfile() profile: NormalizedOAuthProfile,
    @UserAgent() userAgent: string,
    @Ip() ip: string,
  ) {
    return await this.authService.loginWithOAuth(profile, userAgent, ip);
  }
}
