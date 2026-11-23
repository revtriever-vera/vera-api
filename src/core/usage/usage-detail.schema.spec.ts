import { describe, expect, it } from 'vitest';
import { parseUsageDetail } from './usage-detail.schema';

describe('parseUsageDetail', () => {
    it('aceita as chaves fixas e devolve null sem detail', () => {
        expect(parseUsageDetail(undefined)).toBeNull();
        expect(parseUsageDetail({ model: 'provider/model-1', inputTokens: 10, outputTokens: 5 })).toEqual({
            model: 'provider/model-1',
            inputTokens: 10,
            outputTokens: 5
        });
        expect(parseUsageDetail({ category: 'utility' })).toEqual({ category: 'utility' });
    });

    it('recusa chave fora do schema, texto livre no modelo e categoria desconhecida', () => {
        expect(() => parseUsageDetail({ note: 'texto livre' } as never)).toThrow(
            expect.objectContaining({ code: 'usage.invalid_detail' }) as Error
        );
        expect(() => parseUsageDetail({ model: 'frase com espaços e texto livre' })).toThrow();
        expect(() => parseUsageDetail({ category: 'x' } as never)).toThrow();
        expect(() => parseUsageDetail({ inputTokens: -1 })).toThrow();
    });
});
