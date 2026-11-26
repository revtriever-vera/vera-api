import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { MonthlyReviewSummaryService } from '../../ai-assistant/services/monthly-review-summary.service';
import { ClassDisplayNameService } from '../../allocation/services/class-display-name.service';
import { ClassReaderService } from '../../allocation/services/class-reader.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { MonthlyReviewNarrativeService } from './monthly-review-narrative.service';

function make(plan: string) {
    const storedOf = vi.fn().mockResolvedValue({ paragraphs: ['Um.', 'Dois.'], generatedAt: new Date() });
    const paragraphsOf = vi.fn().mockResolvedValue(['Um.']);
    const service: MonthlyReviewNarrativeService = new MonthlyReviewNarrativeService(
        { storedOf, paragraphsOf } as unknown as MonthlyReviewSummaryService,
        { listForCompany: vi.fn().mockResolvedValue([{ id: 'c1', systemKey: 'acoes_br', name: null }]) } as unknown as ClassReaderService,
        { nameOf: vi.fn().mockReturnValue('Ações Brasil') } as unknown as ClassDisplayNameService,
        { planOf: vi.fn().mockResolvedValue(plan) } as unknown as PlanGateService,
        { get: () => ({ locale: 'pt-BR' }) } as unknown as AppContext
    );
    return { service, storedOf, paragraphsOf };
}

describe('MonthlyReviewNarrativeService', () => {
    it('no Premium devolve os parágrafos guardados separados por linha em branco', async () => {
        expect(await make('premium').service.storedOf('2026-10')).toBe('Um.\n\nDois.');
    });

    it('no plano grátis não devolve o texto, nem lê o guardado', async () => {
        const { service, storedOf } = make('free');

        expect(await service.storedOf('2026-10')).toBeNull();
        expect(storedOf).not.toHaveBeenCalled();
    });

    it('sem texto guardado devolve nulo', async () => {
        const { service, storedOf } = make('premium');
        storedOf.mockResolvedValue(null);

        expect(await service.storedOf('2026-10')).toBeNull();
    });

    it('passa à IA a revisão com os nomes das classes da conta', async () => {
        const { service, paragraphsOf } = make('premium');

        await service.paragraphsOf({ month: '2026-10' } as never);

        expect(paragraphsOf).toHaveBeenCalledWith({
            review: { month: '2026-10' },
            labels: [{ classId: 'c1', systemKey: 'acoes_br', displayName: 'Ações Brasil' }]
        });
    });
});
