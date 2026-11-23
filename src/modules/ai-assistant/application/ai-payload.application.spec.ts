import { describe, expect, it, vi } from 'vitest';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { SpendingSummaryService } from '../../spending-summary/services/spending-summary.service';
import { AI_NOTICE_VERSION } from '../domain/ai-notice';
import { AiAssistantLogService } from '../services/ai-assistant-log.service';
import { AiAssistantMetricsService } from '../services/ai-assistant-metrics.service';
import { AiContextBuilderService } from '../services/ai-context-builder.service';
import { AiPayloadApplication } from './ai-payload.application';

function build(overrides: { hasData?: boolean; empty?: boolean; planned?: unknown; cuts?: unknown } = {}) {
    const month = vi.fn().mockReturnValue({ payload: { mes: '2026-10' } });
    const cutsBuilt = vi.fn().mockReturnValue(overrides.cuts === undefined ? { payload: { status: 'possivel' } } : overrides.cuts);
    const portfolio = vi.fn().mockReturnValue({ payload: { moeda_base: 'BRL' } });
    const buildSummary = vi.fn().mockResolvedValue({ hasData: overrides.hasData ?? true });
    const compute = vi.fn().mockReturnValue({ status: 'cut_suggested' });
    const planOrNull = vi.fn().mockReturnValue(overrides.planned ?? null);
    const payloadBuilt = vi.fn();
    const contextBytes = vi.fn();
    const application: AiPayloadApplication = new AiPayloadApplication(
        { build: buildSummary } as unknown as SpendingSummaryService,
        { compute },
        { build: vi.fn().mockResolvedValue({ empty: overrides.empty ?? false }) } as unknown as PortfolioSnapshotService,
        { planOrNull },
        { month, cuts: cutsBuilt, portfolio } as unknown as AiContextBuilderService,
        { payloadBuilt } as unknown as AiAssistantLogService,
        { contextBytes } as unknown as AiAssistantMetricsService
    );
    return { application, buildSummary, compute, planOrNull, month, portfolio, payloadBuilt, contextBytes };
}

describe('AiPayloadApplication', () => {
    it('mês: monta pelo builder e registra o tamanho, sem o conteúdo', async () => {
        const { application, buildSummary, payloadBuilt, contextBytes } = build();

        const view = await application.build({ kind: 'month', month: '2026-09' });

        expect(buildSummary).toHaveBeenCalledWith('2026-09');
        expect(view).toEqual({ kind: 'month', noticeVersion: AI_NOTICE_VERSION, payload: { mes: '2026-10' } });
        expect(payloadBuilt).toHaveBeenCalledWith('month', expect.any(Number));
        expect(contextBytes).toHaveBeenCalledWith('month', expect.any(Number));
    });

    it('cortes: repassa a meta simulada ao cálculo', async () => {
        const { application, compute, buildSummary } = build();

        const view = await application.build({ kind: 'cuts', goalBps: 3500 });

        expect(buildSummary).toHaveBeenCalledWith(null);
        expect(compute).toHaveBeenCalledWith({ hasData: true }, 3500);
        expect(view?.payload).toEqual({ status: 'possivel' });
    });

    it('sem dados no mês ou sem cortes para contar: 204', async () => {
        expect(await build({ hasData: false }).application.build({ kind: 'month' })).toBeNull();
        expect(await build({ hasData: false }).application.build({ kind: 'cuts' })).toBeNull();
        expect(await build({ cuts: null }).application.build({ kind: 'cuts' })).toBeNull();
    });

    it('carteira: com valor planejado usa o planejador, sem valor não planeja', async () => {
        const withAmount = build({ planned: { amountMinor: 500_000 } });
        const without = build();

        await withAmount.application.build({ kind: 'portfolio', contributionMinor: 500_000 });
        await without.application.build({ kind: 'portfolio' });

        expect(withAmount.planOrNull).toHaveBeenCalledWith({ empty: false }, 500_000);
        expect(withAmount.portfolio).toHaveBeenCalledWith({ empty: false }, { amountMinor: 500_000 });
        expect(without.planOrNull).not.toHaveBeenCalled();
        expect(without.portfolio).toHaveBeenCalledWith({ empty: false }, null);
    });

    it('carteira vazia: 204', async () => {
        expect(await build({ empty: true }).application.build({ kind: 'portfolio' })).toBeNull();
    });
});
