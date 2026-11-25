import { describe, expect, it } from 'vitest';
import type { ConcentrationResponse } from '../../../concentration/services/concentration-reader.service';
import { concentrationContextSchema } from '../../validation/ai-payload.schemas';
import { buildConcentrationContext } from './concentration.context';

const POISON_ASSET: string = 'Cdb do Joao da Silva 11987654321';
const POISON_ID: string = '0199f3a0-1111-7222-8333-444455556666';

const RESPONSE: ConcentrationResponse = {
    asOf: '2026-11-22',
    baseCurrency: 'BRL',
    totalMinor: 20_000_000,
    equityTotalMinor: 5_000_000,
    byIssuer: [
        {
            key: POISON_ID,
            kind: 'group',
            name: 'Banco Exemplo',
            valueMinor: 8_000_000,
            shareBps: 4000,
            assets: [POISON_ASSET],
            moreCount: 0
        },
        { key: 'crypto', kind: 'bucket', name: null, valueMinor: 2_000_000, shareBps: 1000, assets: ['BTC'], moreCount: 0 },
        { key: 'missing_issuer', kind: 'bucket', name: null, valueMinor: 1_000_000, shareBps: 500, assets: [], moreCount: 1 }
    ],
    byIssuerOthers: { valueMinor: 1_000_000, shareBps: 500, groups: 14 },
    bySector: [{ key: 'financial', valueMinor: 3_000_000, shareBps: 6000, assets: ['PETR4'], moreCount: 0 }]
};

describe('contexto de concentração', () => {
    it('manda emissor, setor, valor e percentual, sem ativo e sem id de grupo', () => {
        const built = buildConcentrationContext(RESPONSE, 'pt-BR');

        const text: string = JSON.stringify(built.payload);
        [POISON_ASSET, POISON_ID, 'PETR4', 'BTC', 'assets'].forEach((value: string): void => {
            expect(text).not.toContain(value);
        });
        expect(concentrationContextSchema.safeParse(built.payload).success).toBe(true);
        expect(concentrationContextSchema.safeParse({ ...built.payload, ativos: ['PETR4'] }).success).toBe(false);
        expect(built.payload.por_emissor.map((entry) => entry.emissor)).toEqual(['Banco Exemplo', 'Cripto', 'Emissor não informado']);
        expect(built.payload.por_setor).toEqual([{ setor: 'financial', valor: 'R$ 30.000', pct: '60%' }]);
        expect(built.payload.outros_emissores).toEqual({ pct: '5%', grupos: 14 });
        expect(built.numbers).toEqual(expect.arrayContaining([5, 14, 40, 60, 80000, 200000]));
    });

    it('sem emissores além dos maiores não traz outros_emissores e localiza o balde em inglês', () => {
        const built = buildConcentrationContext({ ...RESPONSE, byIssuerOthers: null }, 'en');

        expect(built.payload).not.toHaveProperty('outros_emissores');
        expect(built.payload.por_emissor.map((entry) => entry.emissor)).toContain('Issuer not informed');
    });
});
