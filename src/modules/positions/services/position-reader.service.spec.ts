import { describe, expect, it, vi } from 'vitest';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { PositionDomain } from '../domain/position.domain';
import { PositionReaderService } from './position-reader.service';

describe('PositionReaderService', () => {
    it('lista as posições da company do contexto, pelo filtro de titular', async () => {
        const listByHolder: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ id: 'p1' }]);

        await expect(new PositionReaderService({ listByHolder } as unknown as PositionDomain).listForCompany(ANY_HOLDER)).resolves.toEqual([
            { id: 'p1' }
        ]);
        expect(listByHolder).toHaveBeenCalledWith(ANY_HOLDER);
    });
});
