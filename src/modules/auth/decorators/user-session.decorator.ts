import { createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

export const UserSession = createParamDecorator((data, ctx) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.userSession;
});
