import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { RequireTermsAcceptedGuard } from './require-terms-accepted.guard';

describe('RequireTermsAcceptedGuard', () => {
  const guard = new RequireTermsAcceptedGuard();

  const contextWithQuery = (query: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ query }),
      }),
    }) as unknown as ExecutionContext;

  it('allows the request when termsAccepted=true', () => {
    expect(guard.canActivate(contextWithQuery({ termsAccepted: 'true' }))).toBe(
      true,
    );
  });

  it('rejects when termsAccepted is missing', () => {
    expect(() => guard.canActivate(contextWithQuery({}))).toThrow(
      BadRequestException,
    );
  });

  it('rejects when termsAccepted is not the string "true"', () => {
    expect(() =>
      guard.canActivate(contextWithQuery({ termsAccepted: 'false' })),
    ).toThrow(BadRequestException);
  });
});
