import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from '../../modules/auth/interfaces/auth-user.interface';
import { BEARER_AUTH } from '../../swagger';
import { ApiErrorResponses } from './api-error-responses.decorator';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Opts a route out of the global JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles (checked by RolesGuard). */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

/** Documents bearer authentication + 401 for a controller or route. */
export const ApiAuth = () =>
  applyDecorators(ApiBearerAuth(BEARER_AUTH), ApiErrorResponses(HttpStatus.UNAUTHORIZED));

/** ADMIN-only route with matching Swagger documentation. */
export const AdminOnly = () =>
  applyDecorators(Roles(RoleName.ADMIN), ApiAuth(), ApiErrorResponses(HttpStatus.FORBIDDEN));

/** Injects the authenticated user (or one of its properties). */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<Request>().user;
    return property ? user?.[property] : user;
  },
);

export interface ClientInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Injects the caller's IP address and user agent (truncated to column sizes). */
export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): ClientInfo => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return {
    ipAddress: request.ip?.slice(0, 45) ?? null,
    userAgent: request.header('user-agent')?.slice(0, 512) ?? null,
  };
});
