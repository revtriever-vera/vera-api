import { describe, expect, it, vi } from 'vitest';
import { makeClass } from '../../../../test/support/allocation-factories';
import { UnknownSystemKeyError } from '../domain/allocation.errors';
import { AssetClass } from '../domain/allocation.types';
import { ClassReaderService } from './class-reader.service';
import { ClassResolverService } from './class-resolver.service';

function build(classes: AssetClass[]): ClassResolverService {
    const reader: ClassReaderService = { listForCompany: vi.fn().mockResolvedValue(classes) } as unknown as ClassReaderService;
    return new ClassResolverService(reader);
}

describe('ClassResolverService', () => {
    const fii: AssetClass = makeClass({ systemKey: 'fii', name: null });
    const reits: AssetClass = makeClass({ systemKey: 'reits', name: null });

    it('resolve a classe original pela systemKey', async () => {
        await expect(build([fii, reits]).resolveBySystemKey('fii')).resolves.toBe(fii);
    });

    it('depois de juntar fii em outra classe, resolve pela classe que absorveu', async () => {
        const imoveis: AssetClass = makeClass({ systemKey: 'reits', aliasKeys: ['fii'], name: 'Imóveis' });

        const resolver: ClassResolverService = build([imoveis]);

        await expect(resolver.resolveBySystemKey('fii')).resolves.toBe(imoveis);
        await expect(resolver.resolveBySystemKey('reits')).resolves.toBe(imoveis);
    });

    it('chave desconhecida lança unknown_system_key', async () => {
        await expect(build([fii]).resolveBySystemKey('ouro')).rejects.toBeInstanceOf(UnknownSystemKeyError);
    });
});
