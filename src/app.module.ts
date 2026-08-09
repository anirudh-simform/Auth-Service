import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionModule } from './modules/session/session.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';

@Module({
  imports: [AuthModule, PrismaModule, SessionModule, OrganizationsModule, AuthorizationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
