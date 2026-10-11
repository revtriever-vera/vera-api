import { describe, expect, it } from 'vitest';
import { buildPluggyIndex, mapPluggyCategory, PLUGGY_CATEGORY_INDEX, PluggyIndex } from './pluggy-category-mapper';

const INDEX: PluggyIndex = buildPluggyIndex([
    { pluggyId: '11000000', category: 'eating_out' },
    { pluggyId: '11020000', category: 'groceries' },
    { pluggyId: '11020005', category: 'shopping' },
    { pluggyId: '01000000', category: 'income' }
]);

describe('mapPluggyCategory', () => {
    it('o id exato vence o nível 2, que vence o nível 1', () => {
        expect(mapPluggyCategory(INDEX, '11020005', -100)).toBe('shopping');
        expect(mapPluggyCategory(INDEX, '11020009', -100)).toBe('groceries');
        expect(mapPluggyCategory(INDEX, '11990000', -100)).toBe('eating_out');
    });

    it('id fora do mapa ou do formato devolve nulo', () => {
        expect(mapPluggyCategory(INDEX, '05000000', -100)).toBeNull();
        expect(mapPluggyCategory(INDEX, '05100000', -100)).toBeNull();
        expect(mapPluggyCategory(INDEX, 'abc', -100)).toBeNull();
        expect(mapPluggyCategory(INDEX, '1100', -100)).toBeNull();
        expect(mapPluggyCategory(INDEX, null, -100)).toBeNull();
    });

    it('renda só vale para entrada', () => {
        expect(mapPluggyCategory(INDEX, '01020000', 100)).toBe('income');
        expect(mapPluggyCategory(INDEX, '01020000', -100)).toBeNull();
        expect(mapPluggyCategory(INDEX, '01020000', 0)).toBeNull();
    });

    it('o mapa real não categoriza Pix e TED para terceiros nem empréstimos', () => {
        expect(mapPluggyCategory(PLUGGY_CATEGORY_INDEX, '05000000', -100)).toBeNull();
        expect(mapPluggyCategory(PLUGGY_CATEGORY_INDEX, '06010000', -100)).toBeNull();
        expect(mapPluggyCategory(PLUGGY_CATEGORY_INDEX, '02000000', -100)).toBeNull();
        expect(mapPluggyCategory(PLUGGY_CATEGORY_INDEX, '11000000', -100)).toBe('eating_out');
        expect(mapPluggyCategory(PLUGGY_CATEGORY_INDEX, '04000000', -100)).toBe('own_transfer');
    });
});
