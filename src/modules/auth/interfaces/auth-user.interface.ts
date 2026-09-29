import { RoleName } from '@prisma/client';

/** Claims carried by the access token. */
export interface JwtPayload {
  /** User id. */
  sub: string;
  /** Session id, lets us revoke access tokens server-side (logout). */
  sid: string;
}

/** The authenticated principal attached to `request.user`. */
export interface AuthUser {
  id: string;
  email: string;
  role: RoleName;
  sessionId: string;
}
