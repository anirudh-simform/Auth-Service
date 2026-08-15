import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth/auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token/refresh-token.guard';
import { User } from 'src/generated/prisma/client';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    register: jest.fn(),
    verifyEmail: jest.fn(),
    login: jest.fn(),
    me: jest.fn(),
    refresh: jest.fn(),
    exportMyData: jest.fn(),
    deleteAccount: jest.fn(),
  };

  const user = { id: 'user-1' } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RefreshTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('exportMyData delegates to the authenticated user', async () => {
    await controller.exportMyData(user);

    expect(authServiceMock.exportMyData).toHaveBeenCalledWith('user-1');
  });

  it('deleteAccount delegates the authenticated user id and password', async () => {
    await controller.deleteAccount(user, { password: 'correct-password' });

    expect(authServiceMock.deleteAccount).toHaveBeenCalledWith(
      'user-1',
      'correct-password',
    );
  });
});
