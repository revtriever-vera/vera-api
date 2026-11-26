import { describe, expect, it } from 'vitest';
import { DeadlineExceededError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
    it('devolve o resultado quando o trabalho termina antes do prazo', async () => {
        await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
    });

    it('rejeita com DeadlineExceededError quando o trabalho passa do prazo', async () => {
        const slow: Promise<number> = new Promise<number>((resolve: (value: number) => void): void => {
            setTimeout((): void => {
                resolve(1);
            }, 200);
        });

        await expect(withTimeout(slow, 10)).rejects.toBeInstanceOf(DeadlineExceededError);
    });

    it('repassa o erro do próprio trabalho', async () => {
        await expect(withTimeout(Promise.reject(new Error('falhou')), 50)).rejects.toThrow('falhou');
    });
});
