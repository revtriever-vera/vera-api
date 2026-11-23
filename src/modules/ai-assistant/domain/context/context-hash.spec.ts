import { describe, expect, it } from 'vitest';
import { AiMonthContext } from './ai-context.types';
import { canonicalJson, contextHash, serializeContext } from './context-hash';

const BASE: AiMonthContext = {
    mes: '2026-10',
    parcial: false,
    renda: 'R$ 8.000',
    gastos: 'R$ 5.200',
    guardado: 'R$ 2.800',
    taxa_poupanca: '35%',
    meta_economia_pct: '20%',
    falta_para_meta: 'R$ 0',
    fixos: { total: 'R$ 1.640', pct_renda: '21%' },
    flexiveis: { total: 'R$ 3.560' },
    sem_categoria: { total: 'R$ 120', transacoes: 3 },
    gastos_por_categoria: []
};

describe('hash do contexto', () => {
    it('muda com um centavo e com o locale, e com a versão do prompt', () => {
        const base: string = contextHash(BASE, 'pt-BR', 'v1');

        expect(contextHash({ ...BASE, gastos: 'R$ 5.201' }, 'pt-BR', 'v1')).not.toBe(base);
        expect(contextHash(BASE, 'en', 'v1')).not.toBe(base);
        expect(contextHash(BASE, 'pt-BR', 'v2')).not.toBe(base);
        expect(contextHash(BASE, 'pt-BR', 'v1')).toBe(base);
    });

    it('não muda com a ordem das chaves', () => {
        const reordered: AiMonthContext = {
            gastos_por_categoria: [],
            sem_categoria: { transacoes: 3, total: 'R$ 120' },
            flexiveis: BASE.flexiveis,
            fixos: { pct_renda: '21%', total: 'R$ 1.640' },
            falta_para_meta: BASE.falta_para_meta,
            meta_economia_pct: BASE.meta_economia_pct,
            taxa_poupanca: BASE.taxa_poupanca,
            guardado: BASE.guardado,
            gastos: BASE.gastos,
            renda: BASE.renda,
            parcial: BASE.parcial,
            mes: BASE.mes
        };

        expect(canonicalJson(reordered)).toBe(canonicalJson(BASE));
        expect(contextHash(reordered, 'pt-BR', 'v1')).toBe(contextHash(BASE, 'pt-BR', 'v1'));
        expect(serializeContext(reordered)).not.toBe(serializeContext(BASE));
    });
});
