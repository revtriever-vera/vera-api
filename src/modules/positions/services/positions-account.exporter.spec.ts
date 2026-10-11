import { describe, expect, it, vi } from 'vitest';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { PositionDomain } from '../domain/position.domain';
import { PositionsAccountExporter } from './positions-account.exporter';

describe('PositionsAccountExporter', () => {
    it('exporta posições reais com símbolo, decimais normalizados e classe, sem ids internos', async () => {
        const exporter: PositionsAccountExporter = new PositionsAccountExporter(
            {
                listReal: vi.fn().mockResolvedValue([
                    {
                        id: 'p1',
                        assetId: 'a1',
                        quantity: '40.0000000000',
                        averagePrice: '10.50000000',
                        createdAt: new Date('2026-10-11T10:00:00.000Z')
                    },
                    { id: 'p2', assetId: 'gone', quantity: '1', averagePrice: null, createdAt: new Date('2026-10-11T10:00:00.000Z') }
                ])
            } as unknown as PositionDomain,
            {
                findManyByIds: vi.fn().mockResolvedValue([{ id: 'a1', symbol: 'VOO', name: 'Vanguard S&P 500' }])
            } as unknown as AssetCatalogService,
            {
                listForCompany: vi.fn().mockResolvedValue([
                    { subjectType: 'position', subjectId: 'p1', classId: 'c1' },
                    { subjectType: 'fixed_income', subjectId: 'p2', classId: 'c2' }
                ])
            } as unknown as ClassAssignmentService
        );

        expect(exporter.area).toBe('positions');
        await expect(exporter.exportAll()).resolves.toEqual([
            {
                symbol: 'VOO',
                name: 'Vanguard S&P 500',
                quantity: '40',
                averagePrice: '10.5',
                classId: 'c1',
                createdAt: '2026-10-11T10:00:00.000Z'
            },
            { symbol: null, name: null, quantity: '1', averagePrice: null, classId: null, createdAt: '2026-10-11T10:00:00.000Z' }
        ]);
    });
});
