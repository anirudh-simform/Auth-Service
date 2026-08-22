import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  Permission,
  SystemPermissions,
} from '../constants/system-permissions.constant';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../authorization.service';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(AuthorizationGuard.name);
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const orgId = request['params']['organizationId'];

    // Guards run before DTO validation pipes, so a malformed :organizationId
    // route param would otherwise reach Prisma as a raw string and surface
    // as a 500 (invalid UUID input) instead of a clean 400.
    if (!isUUID(orgId)) {
      throw new BadRequestException('organizationId must be a valid UUID');
    }

    const permissionKey = this.reflector.getAllAndOverride(Permission, [
      context.getHandler(),
      context.getClass(),
    ]);

    return await this.hasPermission(
      orgId as string,
      request.user!.id,
      permissionKey,
    );
  }

  async hasPermission(
    orgId: string,
    userId: string,
    permissionKey: SystemPermissions,
  ) {
    try {
      return await this.authorizationService.isUserAuthorized(
        userId,
        orgId,
        permissionKey,
      );
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.error(
        'UserPermissionVerificationError',
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException(
        'UserPermissionVerificationError: Error while verifying user permissions',
      );
    }
  }
}
