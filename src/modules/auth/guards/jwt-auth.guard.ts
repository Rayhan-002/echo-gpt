import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/auth.decorators';

/** Global guard: every route requires a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  override handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('Invalid or expired access token');
    }
    return user;
  }
}
