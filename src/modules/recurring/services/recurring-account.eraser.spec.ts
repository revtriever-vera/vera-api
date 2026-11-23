import { describe, expect, it, vi } from 'vitest';
import { RecurringAccountEraser } from './recurring-account.eraser';
import { RecurringDetectPublisherService } from './recurring-detect-publisher.service';

describe('RecurringAccountEraser', () => {
    it('cancela os jobs de detecção da company e não conta linhas, que saem pela cascata', async () => {
        const cancel: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const eraser: RecurringAccountEraser = new RecurringAccountEraser({ cancel } as unknown as RecurringDetectPublisherService);

        expect(await eraser.eraseAll('c1')).toBe(0);
        expect(cancel).toHaveBeenCalledWith('c1');
        expect(eraser.area).toBe('recurring');
    });
});
