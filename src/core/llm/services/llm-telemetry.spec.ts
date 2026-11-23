import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../observability/log.service';
import { MetricsService } from '../../observability/metrics.service';
import { LlmLogService } from './llm-log.service';
import { LlmMetricsService } from './llm-metrics.service';

describe('telemetria do core/llm', () => {
    it('as métricas não carregam company nem conteúdo, só conjuntos fechados', () => {
        const metrics = { count: vi.fn(), observe: vi.fn() };
        const service: LlmMetricsService = new LlmMetricsService(metrics as unknown as MetricsService);

        service.request('summary_month', 'gateway', 'answered');
        service.tokens('summary_month', { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3 });
        service.cost('summary_month', 'ai', 10);
        service.duration('summary_month', 'gateway', 90);
        service.divergence('summary_month', 120);

        expect(metrics.count).toHaveBeenCalledWith('vera_llm_requests_total', {
            task: 'summary_month',
            driver: 'gateway',
            outcome: 'answered'
        });
        expect(metrics.count).toHaveBeenCalledWith('vera_llm_tokens_total', { task: 'summary_month', kind: 'cache_read' }, 3);
        expect(metrics.count).toHaveBeenCalledWith('vera_llm_cost_micros_total', { task: 'summary_month', feature: 'ai' }, 10);
        expect(metrics.observe).toHaveBeenCalledWith('vera_llm_request_duration_ms', 90, { task: 'summary_month', driver: 'gateway' });
        expect(metrics.observe).toHaveBeenCalledWith('vera_llm_cost_divergence_bps', 120, { task: 'summary_month' });
        expect(JSON.stringify([...metrics.count.mock.calls, ...metrics.observe.mock.calls])).not.toContain('companyId');
    });

    it('os logs usam os identificadores fixos', () => {
        const logService = { error: vi.fn(), info: vi.fn() };
        const logs: LlmLogService = new LlmLogService(logService as unknown as LogService);

        logs.unpricedModel('vendor/m');
        logs.capReached('summary_month', 'ai');
        logs.bookkeepingFailed('summary_month', 'call', new Error('x'));

        expect(logService.error).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'llm-pricing', meta: { modelId: 'vendor/m' } })
        );
        expect(logService.info).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'llm-quota', meta: { task: 'summary_month', feature: 'ai' } })
        );
        expect(logService.error).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'llm-quota' }));
    });
});
