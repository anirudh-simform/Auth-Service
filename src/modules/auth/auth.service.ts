import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { MagicLinkType } from 'src/generated/prisma/enums';
import { EmailService } from 'src/common/email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
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
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            magicLinkType: MagicLinkType.USER_REGISTRATION,
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
        magicLinks: {
          some: {
            tokenHash: { equals: tokenHash },
            expiresAt: { gt: new Date() },
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
      where: { tokenHash },
      select: { userId: true },
    });

    // delete all the user registration magic links if user is not deleted
    if (user) {
      await this.prismaService.magicLink.deleteMany({
        where: {
          userId: user.userId,
          magicLinkType: MagicLinkType.USER_REGISTRATION,
        },
      });
    }
    return {
      message: `Email verified. Please Login using your email and password by going to the login page`,
    };
  }
}
