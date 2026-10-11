import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_KEY, RateLimit } from './rate-limit.decorator';

class Sample {
    @RateLimit({ key: 'login', limit: 5, windowSeconds: 60, identify: () => null })
    public handler(): void {
        return undefined;
    }
}

describe('RateLimit', () => {
    it('stores the options as reflect metadata for the guard to read', () => {
        const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(Sample.prototype, 'handler');

        const options: unknown = Reflect.getMetadata(RATE_LIMIT_KEY, descriptor?.value as (...args: unknown[]) => void);

        expect(options).toMatchObject({ key: 'login', limit: 5, windowSeconds: 60 });
    });
});
