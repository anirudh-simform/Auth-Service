import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmailModule } from 'src/common/email/email.module';
import { JwtModule } from '@nestjs/jwt';
import { config } from 'src/config';
import { AuthGuard } from './guards/auth/auth.guard';
import { SessionModule } from '../session/session.module';
import { RefreshTokenGuard } from './guards/refresh-token/refresh-token.guard';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    EmailModule,
    SessionModule,
    AuthorizationModule,
    JwtModule.register({
      global: true,
      secret: config.ACCESS_TOKEN_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RefreshTokenGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
