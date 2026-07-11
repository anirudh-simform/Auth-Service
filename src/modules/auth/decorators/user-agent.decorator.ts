import { createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

export const UserAgent = createParamDecorator((data, ctx) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.headers['user-agent'];
});
