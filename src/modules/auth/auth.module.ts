import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmailModule } from 'src/common/email/email.module';
import { JwtModule } from '@nestjs/jwt';
import { config } from 'src/config';
import { AuthGuard } from './guards/auth/auth.guard';
import { SessionModule } from '../session/session.module';
import { RefreshTokenGuard } from './guards/refresh-token/refresh-token.guard';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OAuthController } from './oauth/oauth.controller';
import { GoogleStrategy } from './oauth/strategies/google.strategy';
import { GithubStrategy } from './oauth/strategies/github.strategy';
import { MicrosoftStrategy } from './oauth/strategies/microsoft.strategy';
import { RequireTermsAcceptedGuard } from './guards/require-terms-accepted/require-terms-accepted.guard';

@Module({
  imports: [
    EmailModule,
    SessionModule,
    AuthorizationModule,
    PassportModule.register({ session: false }),
    JwtModule.register({
      global: true,
      secret: config.ACCESS_TOKEN_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    AuthGuard,
    RefreshTokenGuard,
    RequireTermsAcceptedGuard,
    GoogleStrategy,
    GithubStrategy,
    MicrosoftStrategy,
  ],
  exports: [AuthGuard],
})
export class AuthModule {}
