import { describe, expect, it, vi } from 'vitest';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { NoteAssetResolverService } from './note-asset-resolver.service';

function asset(symbol: string, name: string, kind: string): Asset {
    return { symbol, name, kind, market: 'B3' } as unknown as Asset;
}

function build(found: Asset[]): { readonly service: NoteAssetResolverService; readonly searchByName: ReturnType<typeof vi.fn> } {
    const searchByName = vi.fn().mockResolvedValue(found);
    return { service: new NoteAssetResolverService({ searchByName } as unknown as AssetCatalogService), searchByName };
}

describe('NoteAssetResolverService', () => {
    it('resolve a especificação do título pelo nome e pelo sufixo, buscando só no mercado B3', async () => {
        const { service, searchByName } = build([
            asset('PETR3', 'PETROLEO BRASILEIRO S.A. PETROBRAS', 'stock'),
            asset('PETR4', 'PETROLEO BRASILEIRO S.A. PETROBRAS', 'stock')
        ]);

        const resolved: ReadonlyMap<string, string> = await service.resolve(['PETROBRAS PN N2']);

        expect(resolved.get('PETROBRAS PN N2')).toBe('PETR4');
        expect(searchByName).toHaveBeenCalledWith('B3', 'PETROBRAS', 30);
    });

    it('sem correspondência ou ambíguo, a especificação fica de fora (Ativo não encontrado depois)', async () => {
        const { service } = build([asset('AAAA3', 'ALFA', 'stock'), asset('BBBB3', 'ALFA', 'stock')]);

        const resolved: ReadonlyMap<string, string> = await service.resolve(['ALFA ON NM', 'SEM SUFIXO', 'OUTRA ON']);

        expect([...resolved.keys()]).toEqual([]);
    });

    it('não consulta o catálogo quando a especificação não tem sufixo de classe', async () => {
        const { service, searchByName } = build([]);

        await service.resolve(['PETROBRAS']);

        expect(searchByName).not.toHaveBeenCalled();
    });
});
