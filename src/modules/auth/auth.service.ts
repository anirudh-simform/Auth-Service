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
import { MagicLinkType } from 'src/generated/prisma/client';
import { EmailService } from 'src/common/email/email.service';
import { JwtService } from '@nestjs/jwt';
import { UAParser } from 'ua-parser-js';
import { SessionService } from '../session/session.service';
import { UserSession } from 'src/generated/prisma/client';
import { UserSessionWithUserDetails } from './types/express';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/constants/audit-event-types.constant';
import { AuthorizationService } from '../authorization/authorization.service';
import { NormalizedOAuthProfile } from './oauth/types/normalized-oauth-profile';

const SESSION_EXPORT_LIMIT = 500;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    private readonly auditLogService: AuditLogService,
    private readonly authorizationService: AuthorizationService,
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
              terms_accepted_at: new Date(),
            },
            create: {
              email,
              password_hash: passwordHash,
              terms_accepted_at: new Date(),
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
      if (error instanceof ConflictException) {
        throw error;
      }
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

      if (!user.password_hash) {
        throw new BadRequestException(
          'This account uses social login. Please sign in with your provider instead',
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

  /**
   * OAuth login/registration: finds an existing linked identity, links a
   * verified-email match to an existing password-based account, or creates
   * a brand-new user - then issues the same session+JWT as password login.
   */
  async loginWithOAuth(
    profile: NormalizedOAuthProfile,
    userAgent: string,
    ip: string,
  ) {
    const existingLink = await this.prismaService.oAuthAccount.findUnique({
      where: {
        provider_provider_account_id: {
          provider: profile.provider,
          provider_account_id: profile.providerAccountId,
        },
      },
      select: { user_id: true },
    });

    let userId: string;
    let isNewAccount = false;

    if (existingLink) {
      userId = existingLink.user_id;
    } else {
      const existingUser = await this.prismaService.user.findUnique({
        where: { email: profile.email },
        select: { id: true },
      });

      if (existingUser) {
        userId = existingUser.id;
        await this.prismaService.oAuthAccount.create({
          data: {
            provider: profile.provider,
            provider_account_id: profile.providerAccountId,
            user_id: existingUser.id,
          },
        });
      } else {
        isNewAccount = true;
        const created = await this.prismaService.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: profile.email,
              password_hash: null,
              is_email_verified: true,
              terms_accepted_at: new Date(),
            },
          });

          await tx.oAuthAccount.create({
            data: {
              provider: profile.provider,
              provider_account_id: profile.providerAccountId,
              user_id: user.id,
            },
          });

          return user;
        });
        userId = created.id;
      }
    }

    const deviceInfo = UAParser(userAgent);
    const { userSession, refreshToken } =
      await this.sessionService.createUserSession({
        userId,
        userAgent: deviceInfo.ua,
        userIp: ip,
      });

    const payload = { sub: userId, email: profile.email, sid: userSession.id };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.auditLogService.record({
      eventType: AuditEventType.AUTH_OAUTH_LOGIN_SUCCESS,
      actorUserId: userId,
      targetType: 'User',
      targetId: userId,
      ipAddress: ip,
      userAgent,
      metadata: { provider: profile.provider, isNewAccount },
    });

    return {
      access_token: accessToken,
      refresh_token: `${userSession.id}.${refreshToken}`,
    };
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

  /**
   * GDPR Art. 17 (right to erasure). Requires the caller to re-confirm their
   * password - a destructive, irreversible action shouldn't succeed off a
   * bare session token alone. Blocks deletion if the user is an org Owner,
   * since deleting them would orphan the org.
   */
  async deleteAccount(userId: string, password?: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { password_hash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // OAuth-only accounts have no password to re-confirm - the existing JWT
    // session is the trust boundary for them.
    if (user.password_hash) {
      if (!password) {
        throw new BadRequestException('Password is required');
      }
      const isValidPassword = await argon2.verify(user.password_hash, password);
      if (!isValidPassword) {
        throw new BadRequestException('Wrong password');
      }
    }

    const memberships = await this.prismaService.orgMembership.findMany({
      where: { user_id: userId },
      select: { orgRole: { select: { is_system: true, role_name: true } } },
    });

    if (
      memberships.some((membership) =>
        this.authorizationService.isOwnerRole(membership.orgRole),
      )
    ) {
      throw new ConflictException(
        'AccountDeletionError: Transfer ownership of your organizations before deleting your account',
      );
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.magicLink.deleteMany({ where: { user_id: userId } });
      await tx.userSession.deleteMany({ where: { user_id: userId } });
      await tx.orgMembership.deleteMany({ where: { user_id: userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    await this.auditLogService.record({
      eventType: AuditEventType.USER_ACCOUNT_DELETED,
      actorUserId: userId,
      targetType: 'User',
      targetId: userId,
    });

    return { message: 'Account deleted successfully' };
  }

  /**
   * GDPR Art. 15/20 (right to access & data portability). Aggregates the
   * personal data this service holds about the user into a single export.
   */
  async exportMyData(userId: string) {
    const [user, memberships, sessions, auditEvents] = await Promise.all([
      this.prismaService.user.findUnique({
        where: { id: userId },
        omit: { password_hash: true },
      }),
      this.prismaService.orgMembership.findMany({
        where: { user_id: userId },
        select: {
          org: { select: { id: true, name: true } },
          orgRole: { select: { role_name: true } },
        },
      }),
      this.sessionService.getAllSessions(userId, 1, SESSION_EXPORT_LIMIT),
      this.auditLogService.listForActor(userId),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.auditLogService.record({
      eventType: AuditEventType.USER_DATA_EXPORTED,
      actorUserId: userId,
      targetType: 'User',
      targetId: userId,
    });

    return {
      profile: user,
      organizationMemberships: memberships.map((membership) => ({
        organizationId: membership.org.id,
        organizationName: membership.org.name,
        roleName: membership.orgRole.role_name,
      })),
      // refresh_token_hash is never exported, even hashed - it's a live credential
      sessions: sessions.map(
        ({ refresh_token_hash: _refreshTokenHash, ...session }) => session,
      ),
      auditEvents,
    };
  }
}
