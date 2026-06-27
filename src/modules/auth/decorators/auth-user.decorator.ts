import { createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

export const AuthUser = createParamDecorator((data, ctx) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.user;
});
