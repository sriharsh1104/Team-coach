import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('lets a platform admin through', () => {
    expect(
      guard.canActivate(contextFor({ userId: 'u1', isPlatformAdmin: true })),
    ).toBe(true);
  });

  it('blocks an ordinary signed-in user', () => {
    expect(() =>
      guard.canActivate(contextFor({ userId: 'u1', isPlatformAdmin: false })),
    ).toThrow(ForbiddenException);
  });

  it('blocks a request with no authenticated user at all', () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('blocks when the flag is missing rather than defaulting to allow', () => {
    // A shape change upstream must fail closed, never open.
    expect(() => guard.canActivate(contextFor({ userId: 'u1' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects truthy-looking values that are not the real boolean', () => {
    // Nothing user-controlled reaches this guard today. Requiring literally
    // `true` keeps it safe if that ever stops being the case — a string
    // "true" or a 1 from some future code path must not grant access.
    for (const value of ['true', 1, {}, 'yes', [], 'admin']) {
      expect(() =>
        guard.canActivate(contextFor({ userId: 'u1', isPlatformAdmin: value })),
      ).toThrow(ForbiddenException);
    }
  });
});
