import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRegistrationBodyDto } from './dtos/user-registration-body.dto';
import { VerifyEmailQueryParamsDto } from './dtos/verify-email-query-params.dto';
import { UserLoginBodyDto } from './dtos/user-login-body.dto';
import { AuthGuard } from './guards/auth/auth.guard';
import { type User } from 'src/generated/prisma/client';
import { AuthUser } from './decorators/auth-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() payload: UserRegistrationBodyDto) {
    return await this.authService.register(payload.email, payload.password);
  }

  @Get('verify-email')
  async verifyEmail(@Query() queryParams: VerifyEmailQueryParamsDto) {
    return await this.authService.verifyEmail(queryParams.token);
  }

  @Post('login')
  async login(@Body() payload: UserLoginBodyDto) {
    return await this.authService.login(payload.email, payload.password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@AuthUser() user: User) {
    return await this.authService.me(user.id);
  }
}
