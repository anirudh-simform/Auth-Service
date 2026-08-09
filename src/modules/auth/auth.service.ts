import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { MagicLinkType } from 'src/generated/prisma/enums';
import { EmailService } from 'src/common/email/email.service';
import { JwtService } from '@nestjs/jwt';
import { UAParser } from 'ua-parser-js';
import { SessionService } from '../session/session.service';
import { UserSession } from 'src/generated/prisma/client';
import { UserSessionWithUserDetails } from './types/express';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    private readonly auditLogService: AuditLogService,
  ) {}
  async register(email: string, password: string) {
    try {
      const userExists = await this.prismaService.user.findUnique({
        where: { email },
        select: { is_email_verified: true },
      });

      if (userExists?.is_email_verified) {
        throw new ConflictException(`User with email ${email} already exists`);
      }

      const passwordHash = await argon2
        .hash(password)
        .catch((error: unknown) => {
          this.logger.error(
            'Error in Password Hashing',
            error instanceof Error ? error.stack : undefined,
          );
          throw new Error('Error in Password Hashing ');
        });

      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const registeredUser = await this.prismaService.$transaction(
        async (prisma) => {
          const user = await prisma.user.upsert({
            where: { email },
            update: {
              email,
              password_hash: passwordHash,
            },
            create: {
              email,
              password_hash: passwordHash,
            },
          });

          await prisma.magicLink.create({
            data: {
              user_id: user.id,
              token_hash: tokenHash,
              expires_at: new Date(Date.now() + 15 * 60 * 1000),
              magic_link_type: MagicLinkType.USER_REGISTRATION,
            },
          });

          return user;
        },
      );
      await this.emailService.sendEmailVerificationLink(email, token);

      await this.auditLogService.record({
        eventType: AuditEventType.AUTH_REGISTER,
        actorUserId: registeredUser.id,
        targetType: 'User',
        targetId: registeredUser.id,
        metadata: { email },
      });

      return { message: `User registration email sent to email id: ${email}` };
    } catch (error: unknown) {
      throw new InternalServerErrorException(error);
    }
  }

  async verifyEmail(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const rows = await this.prismaService.user.updateMany({
      where: {
        magic_links: {
          some: {
            token_hash: { equals: tokenHash },
            expires_at: { gt: new Date() },
          },
        },
      },
      data: {
        is_email_verified: true,
      },
    });

    if (rows.count === 0) {
      throw new BadRequestException(
        'Verification token is not valid, Please try again',
      );
    }

    const user = await this.prismaService.magicLink.findUnique({
      where: { token_hash: tokenHash },
      select: { user_id: true },
    });

    // delete all the user registration magic links if user is not deleted
    if (user) {
      await this.prismaService.magicLink.deleteMany({
        where: {
          user_id: user.user_id,
          magic_link_type: MagicLinkType.USER_REGISTRATION,
        },
      });

      await this.auditLogService.record({
        eventType: AuditEventType.AUTH_EMAIL_VERIFIED,
        actorUserId: user.user_id,
        targetType: 'User',
        targetId: user.user_id,
      });
    }
    return {
      message: `Email verified. Please Login using your email and password by going to the login page`,
    };
  }

  async login(email: string, password: string, userAgent: string, ip: string) {
    let resolvedUserId: string | null = null;
    try {
      const user = await this.prismaService.user.findUnique({
        where: { email },
        select: {
          id: true,
          password_hash: true,
          is_email_verified: true,
        },
      });

      if (user) {
        resolvedUserId = user.id;
      }

      if (!user) {
        throw new NotFoundException('User not found. Please register first');
      }

      if (!user.is_email_verified) {
        throw new ConflictException(
          'Email not verified, please verify email before logging in',
        );
      }

      const isValidPassword = await argon2.verify(user.password_hash, password);

      if (!isValidPassword) {
        throw new BadRequestException('Wrong email or password');
      }

      /* Fetch device info from HTTP Headers */
      const deviceInfo = UAParser(userAgent);

      const { userSession, refreshToken } =
        await this.sessionService.createUserSession({
          userId: user.id,
          userAgent: deviceInfo.ua,
          userIp: ip,
        });
      const payload = { sub: user.id, email: email, sid: userSession.id };
      const accessToken = await this.jwtService.signAsync(payload);

      await this.auditLogService.record({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        actorUserId: user.id,
        targetType: 'User',
        targetId: user.id,
        ipAddress: ip,
        userAgent,
      });

      return {
        access_token: accessToken,
        refresh_token: `${userSession.id}.${refreshToken}`,
      };
    } catch (error: unknown) {
      this.logger.error(
        'Error during login',
        error instanceof Error ? error.stack : undefined,
      );

      await this.auditLogService.record({
        eventType: AuditEventType.AUTH_LOGIN_FAILURE,
        actorUserId: resolvedUserId,
        targetType: 'User',
        targetId: resolvedUserId,
        metadata: {
          email,
          reason: error instanceof Error ? error.message : 'Unknown error',
        },
        ipAddress: ip,
        userAgent,
      });

      throw error;
    }
  }

  async me(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
      omit: {
        password_hash: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.is_email_verified) {
      throw new ForbiddenException('Email not verified: Cannot access profile');
    }

    return user;
  }

  async refresh(userSession: UserSessionWithUserDetails) {
    await this.sessionService.invalidateSession(userSession.id);
    const { userSession: newSession, refreshToken } =
      await this.sessionService.createUserSession({
        userAgent: userSession.user_agent,
        userId: userSession.user.id,
        userIp: userSession.ip_address,
      });
    const payload = {
      sub: newSession.user_id,
      email: userSession.user.email,
      sid: newSession.id,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.auditLogService.record({
      eventType: AuditEventType.AUTH_TOKEN_REFRESHED,
      actorUserId: newSession.user_id,
      targetType: 'User',
      targetId: newSession.user_id,
    });

    return {
      access_token: accessToken,
      refresh_token: `${newSession.id}.${refreshToken}`,
    };
  }
}
