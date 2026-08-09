import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionModule } from './modules/session/session.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { config } from './config';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: config.THROTTLE_TTL_SECONDS * 1000,
          limit: config.THROTTLE_LIMIT,
        },
      ],
    }),
    AuthModule,
    PrismaModule,
    SessionModule,
    OrganizationsModule,
    AuthorizationModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
