import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from 'src/modules/session/session.service';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  private readonly logger = new Logger(RefreshTokenGuard.name);
  constructor(private readonly sessionService: SessionService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    return await this.validateRefreshToken(request);
  }

  private async validateRefreshToken(req: Request) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer'))
      throw new UnauthorizedException('Invalid authorization header');

    const refreshTokenInput = authHeader.substring(7);

    try {
      const session =
        await this.sessionService.validateSession(refreshTokenInput);
      if (session) {
        req.userSession = session;
        return true;
      } else {
        return false;
      }
    } catch (error: unknown) {
      this.logger.error(
        'RefreshTokenVerificationError',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
