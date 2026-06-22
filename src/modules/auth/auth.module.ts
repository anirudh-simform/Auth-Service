import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmailModule } from 'src/common/email/email.module';
import { JwtModule } from '@nestjs/jwt';
import { config } from 'src/config';

@Module({
  imports: [
    EmailModule,
    JwtModule.register({
      global: true,
      secret: config.ACCESS_TOKEN_SECRET,
      signOptions: { expiresIn: '120s' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
