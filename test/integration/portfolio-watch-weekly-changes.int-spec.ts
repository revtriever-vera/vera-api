import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EnqueueMailRequest } from '../../src/core/mail/mailer.port';
import { PortfolioChangesApplication } from '../../src/modules/portfolio-watch/application/portfolio-changes.application';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';
import { seedAsset } from './support/portfolio-seed';

const MAIL_MESSAGE: string = 'email.send.requested';
const NOW: Date = new Date();
const NEXT_WEEK: Date = DateUtil.addDays(NOW, 7);

function daysAgo(days: number): Date {
    return DateUtil.addDays(NOW, -days);
}

describe('e-mail semanal "O que mudou"', () => {
    let harness: AllocationHarness;
    let publisher: CapturingPublisher;
    let stocks: string;

    beforeAll(async () => {
        publisher = new CapturingPublisher();
        harness = await AllocationHarness.start('weekly_changes', publisher);
        stocks = await seedAsset(
            harness,
            {
                symbol: 'WKLY3',
                classKey: 'acoes_br',
                market: 'B3',
                typeGroup: 'acoes_br',
                currency: 'BRL',
                quantity: '1',
                price: '10',
                provider: 'brapi'
            },
            false
        );
    });

    afterAll(async () => {
        await harness.stop();
    });

    beforeEach(async () => {
        publisher.published.length = 0;
        await harness.pg.query('DELETE FROM "MarketDocumentSummaries"');
        await harness.pg.query('DELETE FROM "MarketDocuments"');
    });

    async function document(name: string, publishedAt: Date, relevance: number, discard: boolean = false): Promise<void> {
        const id: string = crypto.randomUUID();
        await harness.pg.query(
            `INSERT INTO "MarketDocuments" (id, source, "externalId", category, title, "publishedAt", url, status, "assetIds")
             VALUES ($1, 'cvm_ipe', $2, 'relevant_fact', $3, $4, $5, 'summarized', $6::uuid[])`,
            [id, `ext-${name}`, `Título ${name}`, publishedAt, `https://example.com/${name}`, [stocks]]
        );
        await harness.pg.query(
            `INSERT INTO "MarketDocumentSummaries" (id, "documentId", locale, "promptVersion", summary, kind, relevance, discard)
             VALUES ($1, $2, 'pt-BR', 'v1', $3, 'relevant_fact', $4, $5)`,
            [crypto.randomUUID(), id, `Resumo ${name}`, relevance, discard]
        );
    }

    async function account(label: string, premium: boolean): Promise<Account> {
        const created: Account = await harness.signUp(label);
        if (premium) {
            await harness.inCompany(created.company.id, async () =>
                harness.app.get(PlanContractService, { strict: false }).open('premium', {
                    startsAt: new Date('2026-11-01T00:00:00Z'),
                    subscriptionId: crypto.randomUUID()
                })
            );
        }
        const held = await harness.call(created.token, 'POST', '/positions', { assetId: stocks, quantity: '10' });
        expect(held.status).toBe(201);
        return created;
    }

    async function evaluate(target: Account, at: Date = NOW): Promise<number> {
        const application: PortfolioChangesApplication = harness.app.get(PortfolioChangesApplication, { strict: false });
        return harness.inCompany(target.company.id, async () => application.evaluateWeekly(target.company.id, at));
    }

    function mails(): EnqueueMailRequest[] {
        return publisher.ofType(MAIL_MESSAGE).map((message: PublishedMessage): EnqueueMailRequest => message.payload as EnqueueMailRequest);
    }

    it('manda um e-mail com os documentos de relevância 2 ou mais e não reenvia na mesma semana', async () => {
        const premium: Account = await account('weekly-send', true);
        await document('alto', daysAgo(1), 3);
        await document('medio', daysAgo(2), 2);
        await document('baixo', daysAgo(2), 1);

        const first: number = await evaluate(premium);
        const second: number = await evaluate(premium);

        expect(first).toBe(1);
        expect(second).toBe(0);
        expect(mails()).toHaveLength(1);
        expect(mails()[0]?.template).toBe('portfolio-weekly-changes');
        expect(mails()[0]?.to.email).toBe(premium.user.email);
        expect(mails()[0]?.unsubscribeUrl).toContain('/notifications/unsubscribe/');
        const items: { summary: string }[] = JSON.parse(mails()[0]?.props['items'] ?? '[]');
        expect(items.map((item: { summary: string }): string => item.summary).sort()).toEqual(['Resumo alto', 'Resumo medio']);
    });

    it('em outra semana o aviso sai de novo', async () => {
        const premium: Account = await account('weekly-next', true);
        await document('novo', daysAgo(1), 2);
        await document('seguinte', DateUtil.addDays(NOW, 6), 2);

        await evaluate(premium);
        await evaluate(premium, NEXT_WEEK);

        expect(mails()).toHaveLength(2);
    });

    it('conta com documentos só de relevância menor que 2 ou descartados não recebe nada', async () => {
        const premium: Account = await account('weekly-low', true);
        await document('baixo', daysAgo(1), 1);
        await document('descartado', daysAgo(1), 3, true);

        const sent: number = await evaluate(premium);

        expect(sent).toBe(0);
        expect(mails()).toHaveLength(0);
    });

    it('conta Free não recebe', async () => {
        const free: Account = await account('weekly-free', false);
        await document('alto', daysAgo(1), 3);

        const sent: number = await evaluate(free);

        expect(sent).toBe(0);
        expect(mails()).toHaveLength(0);
    });

    it('quem desligou o aviso não recebe', async () => {
        const muted: Account = await account('weekly-muted', true);
        await document('alto', daysAgo(1), 3);
        const off = await harness.call(muted.token, 'PATCH', '/notifications/preferences', {
            type: 'portfolio_weekly_changes',
            enabled: false
        });
        expect(off.status).toBe(200);

        const sent: number = await evaluate(muted);

        expect(sent).toBe(0);
        expect(mails()).toHaveLength(0);
    });

    it('a varredura pede uma avaliação por conta com posição, com o jobId da semana', async () => {
        const premium: Account = await account('weekly-fan', true);
        const application: PortfolioChangesApplication = harness.app.get(PortfolioChangesApplication, { strict: false });

        await application.fanOutWeekly(NOW);

        const jobIds: (string | undefined)[] = publisher
            .ofType('portfolio-watch.weekly-changes.company.requested')
            .map((message: PublishedMessage) => message.options?.jobId);
        expect(
            jobIds.some((jobId: string | undefined): boolean => (jobId ?? '').startsWith(`portfolio-watch-weekly-${premium.company.id}-`))
        ).toBe(true);
        expect(jobIds.every((jobId: string | undefined): boolean => !(jobId ?? '').includes(':'))).toBe(true);
    });
});
