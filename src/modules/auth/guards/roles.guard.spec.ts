import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const contextFor = (role?: RoleName) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { id: 'u1', role } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  afterEach(() => jest.restoreAllMocks());

  it('allows routes without role requirements', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextFor(RoleName.USER))).toBe(true);
  });

  it('allows users with a required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleName.ADMIN]);
    expect(guard.canActivate(contextFor(RoleName.ADMIN))).toBe(true);
  });

  it('forbids users without a required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleName.ADMIN]);
    expect(() => guard.canActivate(contextFor(RoleName.USER))).toThrow(ForbiddenException);
  });

  it('forbids anonymous requests on role-protected routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([RoleName.ADMIN]);
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});
