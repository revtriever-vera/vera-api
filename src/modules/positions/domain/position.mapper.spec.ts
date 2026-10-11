import { describe, expect, it } from 'vitest';
import { toPositionView } from './position.mapper';
import { Position } from './positions.types';

describe('toPositionView', () => {
    it('normaliza os decimais e serializa as datas', () => {
        const position: Position = {
            id: 'p1',
            companyId: 'c1',
            assetId: 'a1',
            quantity: '40.0000000000',
            averagePrice: '545.50000000',
            createdAt: new Date('2026-10-11T10:00:00.000Z'),
            updatedAt: new Date('2026-10-11T11:00:00.000Z'),
            deletedAt: null,
            isSample: false
        };

        expect(toPositionView(position, 'class-1')).toEqual({
            id: 'p1',
            assetId: 'a1',
            quantity: '40',
            averagePrice: '545.5',
            classId: 'class-1',
            createdAt: '2026-10-11T10:00:00.000Z',
            updatedAt: '2026-10-11T11:00:00.000Z'
        });
        expect(toPositionView({ ...position, averagePrice: null }, 'class-1').averagePrice).toBeNull();
    });
});
