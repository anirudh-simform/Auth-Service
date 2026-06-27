jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: jest.fn(),
}));

import * as argon2 from 'argon2';
jest.mock('argon2');
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/common/email/email.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AuthService', () => {
  let authService: AuthService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        EmailService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('User login', () => {
    it('should throw not found exception when user does not exist', async () => {
      prismaMock.user.findUnique.mockReturnValueOnce(null);
      await expect(
        authService.login('dummy@gmail.com', 'password'),
      ).rejects.toThrow('User not found. Please register first');
    });

    it('should throw conflict exception when email not verified', async () => {
      prismaMock.user.findUnique.mockReturnValueOnce({
        id: 1,
        password_hash: 'string',
        is_email_verified: false,
      });
      await expect(
        authService.login('dummy@gmail.com', 'password'),
      ).rejects.toThrow(
        'Email not verified, please verify email before logging in',
      );
    });

    it('should throw bad request exception when password not correct', async () => {
      // get correct user object
      prismaMock.user.findUnique.mockReturnValueOnce({
        id: 1,
        password_hash: 'string',
        is_email_verified: true,
      });

      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login('dummy@gmail.com', 'password'),
      ).rejects.toThrow('Wrong email or password');
    });
  });

  describe('me: User profile retrieval', () => {
    it('should throw not found exception when user does not exist', async () => {
      prismaMock.user.findUnique.mockReturnValueOnce(null);
      await expect(authService.me(1)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });

    it('should throw conflict exception when email not verified', async () => {
      prismaMock.user.findUnique.mockReturnValueOnce({
        id: 1,
        password_hash: 'string',
        is_email_verified: false,
      });
      await expect(authService.me(1)).rejects.toThrow(
        new ForbiddenException('Email not verified: Cannot access profile'),
      );
    });
  });
});
