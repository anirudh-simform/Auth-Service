import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { config } from 'src/config';
import { JwtPayload } from '../../types/jwt-payload.type';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  constructor(
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
  ) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    return this.validateUser(request);
  }

  private async validateUser(req: Request): Promise<boolean> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer'))
      throw new UnauthorizedException('Invalid authorization header');

    const authToken = authHeader.substring(7);
    if (!authToken) throw new UnauthorizedException('Token not present');

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(authToken, {
        secret: config.ACCESS_TOKEN_SECRET,
      });

      const user = await this.prismaService.user.findUnique({
        where: { email: payload.email },
        omit: { password_hash: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      req.user = user;
      return true;
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.stack : undefined);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
