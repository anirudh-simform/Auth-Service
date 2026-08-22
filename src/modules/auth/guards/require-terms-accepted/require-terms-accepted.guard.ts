import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Runs before the Passport provider guard on OAuth initiation routes, so
 * consent is recorded before the redirect to the provider happens - the
 * provider's own consent screen isn't a substitute for this app's terms
 * acceptance record (same GDPR lawful-basis reasoning as password registration).
 */
@Injectable()
export class RequireTermsAcceptedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.query.termsAccepted !== 'true') {
      throw new BadRequestException(
        'You must accept the terms and conditions to continue (pass ?termsAccepted=true)',
      );
    }

    return true;
  }
}
