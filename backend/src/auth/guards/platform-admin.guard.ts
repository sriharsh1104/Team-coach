import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../strategies/jwt.strategy';

/**
 * Gate for platform-wide admin routes. Always stack it *behind* JwtAuthGuard:
 *
 *   @UseGuards(JwtAuthGuard, PlatformAdminGuard)
 *
 * The flag it reads was put on the request by JwtStrategy.validate, which
 * loads it from the database on every request. So this is not trusting a
 * token claim, a header, or anything else the caller controls — a user who
 * is not an admin in the database cannot reach these routes no matter what
 * they send. Revoking admin in the database takes effect on the next
 * request, without waiting for any token to expire.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    // Strict `=== true`, not a truthy check: this is the one place in the
    // app where being wrong grants cross-org read access, so anything that
    // is not literally the boolean the database returned fails closed.
    if (user?.isPlatformAdmin !== true) {
      // Deliberately the same message either way: a non-admin learns nothing
      // about whether the route exists or who may use it.
      throw new ForbiddenException('Not allowed');
    }
    return true;
  }
}
