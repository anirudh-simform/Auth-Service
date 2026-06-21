import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRegistrationBodyDto } from './dtos/user-registration-body.dto';
import { VerifyEmailQueryParamsDto } from './dtos/verify-email-query-params.dto';

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
}
