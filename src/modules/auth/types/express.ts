import { User, UserSession } from 'src/generated/prisma/client';

declare module 'express-serve-static-core' {
  export interface Request {
    user?: Omit<User, 'password_hash'>;
    userSession: UserSessionWithUserDetails;
  }
}

export type UserSessionWithUserDetails = {
  user: Pick<User, 'id' | 'email'>;
} & UserSession;
