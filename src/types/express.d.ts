import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by RequestIdMiddleware. */
      requestId?: string;
    }
  }
}
