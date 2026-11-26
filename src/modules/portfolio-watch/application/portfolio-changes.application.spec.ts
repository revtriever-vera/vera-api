import { describe, expect, it, vi } from 'vitest';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { ChangeItem, ChangesFeed, ChangesQuery, MAX_CHANGES_ITEMS } from '../domain/portfolio-changes.types';
import { FeatureLockedError } from '../domain/portfolio-watch.errors';
import { PortfolioChangesReaderService } from '../services/portfolio-changes-reader.service';
import { PortfolioChangesApplication } from './portfolio-changes.application';

const QUERY: ChangesQuery = { days: 7, classId: null, holder: { kind: 'any' } };

function item(index: number): ChangeItem {
    return {
        id: String(index),
        assetId: 'a',
        symbol: 'AAAA3',
        source: 'cvm_ipe',
        category: 'relevant_fact',
        title: 'T',
        kind: null,
        date: '2026-12-01',
        summary: 'x',
        summaryAvailable: true,
        relevance: 1,
        weightBps: 100,
        weightLine: null,
        documentUrl: 'https://example.com'
    };
}

function build(plan: string, total: number): PortfolioChangesApplication {
    const feed: ChangesFeed = {
        days: 7,
        notice: 'n',
        items: Array.from({ length: total }, (_unused: unknown, index: number) => item(index))
    };
    return new PortfolioChangesApplication(
        { read: vi.fn().mockResolvedValue(feed) } as unknown as PortfolioChangesReaderService,
        { planOf: vi.fn().mockResolvedValue(plan) } as unknown as PlanGateService
    );
}

describe('PortfolioChangesApplication', () => {
    it('plano Free recebe plan.feature_locked com a contagem de documentos e nenhum conteúdo', async () => {
        const error: unknown = await build('free', 4)
            .list(QUERY)
            .catch((caught: unknown): unknown => caught);

        expect(error).toBeInstanceOf(FeatureLockedError);
        expect(error).toMatchObject({ code: 'plan.feature_locked', status: 402, meta: { documentCount: 4 } });
    });

    it('Premium e auto-hospedado recebem o feed, no máximo o teto de itens', async () => {
        const premium: ChangesFeed = await build('premium', MAX_CHANGES_ITEMS + 5).list(QUERY);
        const selfHosted: ChangesFeed = await build('self_hosted', 2).list(QUERY);

        expect(premium.items).toHaveLength(MAX_CHANGES_ITEMS);
        expect(selfHosted.items).toHaveLength(2);
    });
});
