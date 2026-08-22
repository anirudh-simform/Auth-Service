import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { v7 as uuidv7 } from 'uuid';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createUserSession(sessionData: {
    userId: string;
    userAgent: string;
    userIp: string;
  }) {
    try {
      const sessionId = uuidv7();

      const refreshToken = randomBytes(32).toString('hex');
      const refreshTokenHash = createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      const userSession = await this.prismaService.userSession.create({
        data: {
          id: sessionId,
          user_id: sessionData.userId,
          last_active_at: new Date(),
          refresh_token_hash: refreshTokenHash,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          user_agent: sessionData.userAgent,
          ip_address: sessionData.userIp,
        },
      });

      return { userSession, refreshToken };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        this.logger.error(
          'SessionCreationError: Trying to create a session for a non-existing user',
        );
        throw new BadRequestException('The user does not exist');
      }

      this.logger.error(
        'SessionCreationError: Error Occured while creating a session',
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  /** Validates user session using refresh token from client.
   * @param refreshToken - contains session_id and refresh_token separated by '.'
   */
  async validateSession(refreshToken: string) {
    try {
      const [sessionId, token] = refreshToken.split('.');

      const refreshTokenHash = createHash('sha256').update(token).digest('hex');

      const session = await this.prismaService.userSession.findUnique({
        where: {
          id: sessionId,
        },
        include: {
          user: { select: { id: true, email: true } },
        },
      });

      if (!session) {
        throw new UnauthorizedException('User session not found');
      }

      if (new Date() > session.expires_at) {
        this.logger.log('SessionExpiredError: Session Expired');
        throw new UnauthorizedException('SessionExpiredError: Session Expired');
      } else if (session.revoked_at !== null) {
        this.logger.log('SessionRevokedError: Session Revoked');
        throw new UnauthorizedException('SessionRevokedError: Session Revoked');
      } else if (session.refresh_token_hash !== refreshTokenHash) {
        this.logger.log('InvalidRefreshToken: Invalid Token');
        throw new UnauthorizedException('InvalidRefreshToken: Invalid Token');
      }

      return session;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.log(
        'SesssionValidationError: Error occured while validation user session',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /** Invalidates user session by setting expired_at value to current timestamp */
  async invalidateSession(sessionId: string) {
    try {
      const result = await this.prismaService.userSession.updateMany({
        where: {
          id: sessionId,
        },
        data: {
          expires_at: new Date(),
        },
      });

      if (result.count === 0) {
        this.logger.error('SessionInvalidationError: Session Not Found');
        throw new NotFoundException(
          'SessionInvalidationError: Session Not Found',
        );
      }
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        'SessionInvalidationError',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  /** Revokes a single session, scoped to the caller so a session can only be
   * revoked by the user who owns it.
   * @param sessionId string
   * @param callerId id of the user performing the revocation - also the ownership check and audit actor
   */
  async revokeSingleSession(sessionId: string, callerId: string) {
    try {
      const result = await this.prismaService.userSession.updateMany({
        where: { id: sessionId, user_id: callerId },
        data: { revoked_at: new Date() },
      });

      if (result.count === 0) {
        throw new NotFoundException('Session not found');
      }

      await this.auditLogService.record({
        eventType: AuditEventType.SESSION_REVOKED,
        actorUserId: callerId,
        targetType: 'UserSession',
        targetId: sessionId,
      });

      return { message: 'User session revoked' };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2001'
      ) {
        this.logger.error(
          'SessionRevokationError: Session Not Found',
          error instanceof Error ? error.stack : undefined,
        );
        throw new InternalServerErrorException(
          'SessionRevokationError: An Error Occurred during session revokation',
        );
      }
      this.logger.error(
        'SessionRevokationError: Something Unexpected Occurred',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'SessionRevokationError: An Error Occurred during session revokation',
      );
    }
  }

  /** Fetches a paginated list of sessions belonging to the given user
   * @param userId id of the user whose sessions are being listed
   * @param [limit=10] number of records to include in the final response, default is 10
   * @param [page=1] page number used to calculate offset, default is 1
   */
  async getAllSessions(userId: string, page: number = 1, limit: number = 10) {
    return await this.prismaService.userSession.findMany({
      where: { user_id: userId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updated_at: 'desc' },
    });
  }

  /** Revokes all session of a user
   * @param userId
   */
  async revokeAllSessionsForUser(userId: string) {
    const result = await this.prismaService.userSession.updateMany({
      where: { user_id: userId },
      data: { revoked_at: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('No Sessions Found');
    }

    await this.auditLogService.record({
      eventType: AuditEventType.SESSION_ALL_REVOKED,
      actorUserId: userId,
      targetType: 'User',
      targetId: userId,
      metadata: { revokedCount: result.count },
    });

    return { message: `${result.count} sessions revoked` };
  }
}
