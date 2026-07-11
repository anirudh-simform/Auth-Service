import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { AuthGuard } from '../auth/guards/auth/auth.guard';
import { PaginationQueryParamsDto } from 'src/common/dtos/pagination-query-params.dto';
import { RevokeSessionParamsDto } from './dtos/revoke-session-params.dto';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { type User } from 'src/generated/prisma/client';

@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getAllSessions(@Query() queryParams: PaginationQueryParamsDto) {
    return await this.sessionService.getAllSessions(
      queryParams.page,
      queryParams.limit,
    );
  }

  @Patch(':sessionId')
  @UseGuards(AuthGuard)
  async revokeSingleSession(@Param() params: RevokeSessionParamsDto) {
    return await this.sessionService.revokeSingleSession(params.sessionId);
  }

  @Patch('user/revoke-all')
  @UseGuards(AuthGuard)
  async revokeAllSessionsForUser(@AuthUser() user: User) {
    return await this.sessionService.revokeAllSessionsForUser(user.id);
  }
}
