import { describe, expect, it } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import type { PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import type { MonthlySummary } from '../../spending-summary/services/spending-summary.service';
import type { CutsResult } from '../../spending-cuts/services/spending-cuts.service';
import { AiMonthContext } from '../domain/context/ai-context.types';
import { AiContextBuilderService } from './ai-context-builder.service';

const MONTH: AiMonthContext = {
    mes: '2026-10',
    parcial: false,
    renda: 'R$ 1',
    gastos: 'R$ 1',
    guardado: 'R$ 0',
    taxa_poupanca: null,
    meta_economia_pct: '20%',
    falta_para_meta: 'R$ 0',
    fixos: { total: 'R$ 0', pct_renda: null },
    flexiveis: { total: 'R$ 0' },
    sem_categoria: { total: 'R$ 0', transacoes: 0 },
    gastos_por_categoria: []
};

function builder(locale: 'pt-BR' | 'en'): AiContextBuilderService {
    return new AiContextBuilderService({ get: () => ({ locale }) } as unknown as AppContext);
}

describe('AiContextBuilderService', () => {
    it('monta no locale efetivo da sessão', () => {
        const summary = {
            month: '2026-10',
            isPartial: false,
            income: { minor: 100_000 },
            expensesMinor: 0,
            savedMinor: 0,
            savingsRateBps: null,
            goal: { bps: 2000 },
            gapMinor: 0,
            fixedMinor: 0,
            fixedShareBps: null,
            flexibleMinor: 0,
            uncategorizedMinor: 0,
            uncategorizedCount: 0,
            categories: []
        } as unknown as MonthlySummary;

        expect(builder('pt-BR').month(summary).payload.renda).toBe('R$ 1.000');
        expect(builder('en').month(summary).payload.renda).toBe('R$1,000');
    });

    it('monta cortes e carteira pelo mesmo caminho', () => {
        const cuts = { status: 'goal_met', goal: { bps: 2000 }, gapMinor: 0, suggestions: [] } as unknown as CutsResult;
        const snapshot = {
            baseCurrency: 'BRL',
            totalMinor: 0,
            toleranceBps: 500,
            dollarExposure: { shareBps: 0 },
            classes: []
        } as unknown as PortfolioSnapshot;

        expect(builder('pt-BR').cuts(cuts)?.payload.status).toBe('meta_batida');
        expect(builder('pt-BR').portfolio(snapshot, null).payload.moeda_base).toBe('BRL');
    });

    it('o hash usa a versão do prompt da tarefa e recusa tarefa fora do catálogo', () => {
        const service: AiContextBuilderService = builder('pt-BR');

        expect(service.hash(MONTH, 'summary_month')).toMatch(/^[0-9a-f]{64}$/);
        expect(service.hash(MONTH, 'summary_month')).not.toBe(builder('en').hash(MONTH, 'summary_month'));
        expect(() => service.hash(MONTH, 'inexistente' as never)).toThrow('LLM task catalog');
    });
});
