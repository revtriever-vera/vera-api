import { describe, expect, it } from 'vitest';
import { ThrottleDomain } from './domain/throttle.domain';
import { ThrottleService, TooManyAttemptsError } from './throttle.service';

class InMemoryThrottleDomain {
    private readonly counts: Map<string, number> = new Map();

    public registerAttempt(key: string, _windowSeconds: number): Promise<number> {
        const next: number = (this.counts.get(key) ?? 0) + 1;
        this.counts.set(key, next);
        return Promise.resolve(next);
    }
}

function serviceWith(): ThrottleService {
    return new ThrottleService(new InMemoryThrottleDomain() as unknown as ThrottleDomain);
}

describe('ThrottleService', () => {
    it('allows attempts up to the limit', async () => {
        const throttle: ThrottleService = serviceWith();

        await expect(throttle.assertAllowed('login:ana', 3, 60)).resolves.toBeUndefined();
        await expect(throttle.assertAllowed('login:ana', 3, 60)).resolves.toBeUndefined();
        await expect(throttle.assertAllowed('login:ana', 3, 60)).resolves.toBeUndefined();
    });

    it('throws TooManyAttemptsError on the attempt after the limit', async () => {
        const throttle: ThrottleService = serviceWith();

        await throttle.assertAllowed('login:ana', 2, 60);
        await throttle.assertAllowed('login:ana', 2, 60);

        await expect(throttle.assertAllowed('login:ana', 2, 60)).rejects.toBeInstanceOf(TooManyAttemptsError);
    });

    it('keeps limits independent per key', async () => {
        const throttle: ThrottleService = serviceWith();

        await throttle.assertAllowed('login:ana', 1, 60);
        await expect(throttle.assertAllowed('login:ana', 1, 60)).rejects.toBeInstanceOf(TooManyAttemptsError);
        await expect(throttle.assertAllowed('login:beto', 1, 60)).resolves.toBeUndefined();
    });
});
