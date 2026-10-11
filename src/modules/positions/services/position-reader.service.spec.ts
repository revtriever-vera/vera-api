import { describe, expect, it, vi } from 'vitest';
import { PositionDomain } from '../domain/position.domain';
import { PositionReaderService } from './position-reader.service';

describe('PositionReaderService', () => {
    it('lista as posições da company do contexto', async () => {
        const listAll: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ id: 'p1' }]);

        await expect(new PositionReaderService({ listAll } as unknown as PositionDomain).listForCompany()).resolves.toEqual([{ id: 'p1' }]);
    });
});
