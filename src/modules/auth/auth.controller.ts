import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { UserRegistrationBodyDto } from './dtos/user-registration-body.dto';
import { VerifyEmailQueryParamsDto } from './dtos/verify-email-query-params.dto';
import { UserLoginBodyDto } from './dtos/user-login-body.dto';
import { DeleteAccountBodyDto } from './dtos/delete-account-body.dto';
import { AuthGuard } from './guards/auth/auth.guard';
import { type User } from 'src/generated/prisma/client';
import { AuthUser } from './decorators/auth-user.decorator';
import { UserAgent } from './decorators/user-agent.decorator';
import { RefreshTokenGuard } from './guards/refresh-token/refresh-token.guard';
import { UserSession } from './decorators/user-session.decorator';
import { type UserSessionWithUserDetails } from './types/express';
import { config } from 'src/config';

const AUTH_THROTTLE = {
  default: {
    ttl: config.AUTH_THROTTLE_TTL_SECONDS * 1000,
    limit: config.AUTH_THROTTLE_LIMIT,
  },
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  async register(@Body() payload: UserRegistrationBodyDto) {
    return await this.authService.register(payload.email, payload.password);
  }

  @Get('verify-email')
  @Throttle(AUTH_THROTTLE)
  async verifyEmail(@Query() queryParams: VerifyEmailQueryParamsDto) {
    return await this.authService.verifyEmail(queryParams.token);
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  async login(
    @Body() payload: UserLoginBodyDto,
    @Ip() ip: string,
    @UserAgent() userAgent: string,
  ) {
    return await this.authService.login(
      payload.email,
      payload.password,
      userAgent,
      ip,
    );
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@AuthUser() user: User) {
    return await this.authService.me(user.id);
  }

  @Get('me/export')
  @UseGuards(AuthGuard)
  async exportMyData(@AuthUser() user: User) {
    return await this.authService.exportMyData(user.id);
  }

  @Delete('me')
  @UseGuards(AuthGuard)
  async deleteAccount(
    @AuthUser() user: User,
    @Body() payload: DeleteAccountBodyDto,
  ) {
    return await this.authService.deleteAccount(user.id, payload.password);
  }

  @Get('refresh')
  @UseGuards(RefreshTokenGuard)
  @Throttle(AUTH_THROTTLE)
  async refresh(@UserSession() userSession: UserSessionWithUserDetails) {
    return await this.authService.refresh(userSession);
  }
}
