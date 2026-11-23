import { describe, expect, it, vi } from 'vitest';
import { ThrottlesRepository } from '../repositories/throttles.repository';
import { ThrottleDomain } from './throttle.domain';

describe('ThrottleDomain', () => {
    it('delegates the attempt to the atomic repository upsert and returns the new count', async () => {
        const registerAttempt: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(3);
        const throttles: ThrottleDomain = new ThrottleDomain({ registerAttempt } as unknown as ThrottlesRepository);

        expect(await throttles.registerAttempt('key-1', 60)).toBe(3);
        expect(registerAttempt).toHaveBeenCalledWith('key-1', 60);
    });

    it('forgets a key through the repository', async () => {
        const forget: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);

        await new ThrottleDomain({ forget } as unknown as ThrottlesRepository).forget('key-1');

        expect(forget).toHaveBeenCalledWith('key-1');
    });
});
