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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
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

      await this.prismaService.$transaction(async (prisma) => {
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
      });
      await this.emailService.sendEmailVerificationLink(email, token);
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
    }
    return {
      message: `Email verified. Please Login using your email and password by going to the login page`,
    };
  }

  async login(email: string, password: string) {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { email },
        select: {
          id: true,
          password_hash: true,
          is_email_verified: true,
        },
      });

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

      const payload = { sub: user.id, email: email };
      const accessToken = await this.jwtService.signAsync(payload);

      return { access_token: accessToken };
    } catch (error: unknown) {
      this.logger.error(
        'Error during login',
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  async me(userId: number) {
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
}
