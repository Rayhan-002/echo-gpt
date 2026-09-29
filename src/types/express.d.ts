import 'express';
import type { AuthUser } from '../modules/auth/interfaces/auth-user.interface';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthUser {}

    interface Request {
      /** Correlation id assigned by RequestIdMiddleware. */
      requestId?: string;
    }
  }
}
