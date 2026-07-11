import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionModule } from './modules/session/session.module';

@Module({
  imports: [AuthModule, PrismaModule, SessionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
