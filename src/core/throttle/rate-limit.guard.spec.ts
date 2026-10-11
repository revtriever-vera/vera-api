import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitOptions, RateLimitSubject } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { ThrottleService } from './throttle.service';

function contextWith(body: Record<string, unknown>, params: Record<string, string>, ip: string): ExecutionContext {
    return {
        getHandler: () => (): void => undefined,
        switchToHttp: () => ({ getRequest: () => ({ body, params, ip }) })
    } as unknown as ExecutionContext;
}

function reflectorReturning(options: RateLimitOptions | undefined): Reflector {
    return { get: () => options } as unknown as Reflector;
}

function throttleStub(): { throttle: ThrottleService; assertAllowed: ReturnType<typeof vi.fn> } {
    const assertAllowed: ReturnType<typeof vi.fn> = vi.fn();
    return { throttle: { assertAllowed } as unknown as ThrottleService, assertAllowed };
}

describe('RateLimitGuard', () => {
    it('allows the request through when no @RateLimit metadata is present', async () => {
        const { throttle, assertAllowed } = throttleStub();
        const guard: RateLimitGuard = new RateLimitGuard(reflectorReturning(undefined), throttle);

        await expect(guard.canActivate(contextWith({}, {}, '127.0.0.1'))).resolves.toBe(true);
        expect(assertAllowed).not.toHaveBeenCalled();
    });

    it('allows the request through when identify() finds nothing to key on', async () => {
        const { throttle, assertAllowed } = throttleStub();
        const options: RateLimitOptions = { key: 'login', limit: 5, windowSeconds: 60, identify: () => null };
        const guard: RateLimitGuard = new RateLimitGuard(reflectorReturning(options), throttle);

        await expect(guard.canActivate(contextWith({}, {}, '127.0.0.1'))).resolves.toBe(true);
        expect(assertAllowed).not.toHaveBeenCalled();
    });

    it('asserts the throttle using the key built from the subject', async () => {
        const { throttle, assertAllowed } = throttleStub();
        const options: RateLimitOptions = {
            key: 'login',
            limit: 5,
            windowSeconds: 60,
            identify: (subject: RateLimitSubject): string | null => subject.body['email'] as string
        };
        const guard: RateLimitGuard = new RateLimitGuard(reflectorReturning(options), throttle);

        await guard.canActivate(contextWith({ email: 'ana@cliente.com' }, {}, '127.0.0.1'));

        expect(assertAllowed).toHaveBeenCalledWith('login:ana@cliente.com', 5, 60);
    });
});
