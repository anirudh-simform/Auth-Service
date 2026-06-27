import { User } from 'src/generated/prisma/client';

declare module 'express-serve-static-core' {
  export interface Request {
    user?: Omit<User, 'password_hash'>;
  }
}
