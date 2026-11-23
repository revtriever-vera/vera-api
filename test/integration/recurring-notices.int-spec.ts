import { afterAll, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { EnqueueMailRequest, MailerPort } from '../../src/core/mail/mailer.port';
import { AccountDataRegistry } from '../../src/modules/identity/services/account-data.registry';
import { MemberDepartureRegistry } from '../../src/modules/identity/services/member-departure.registry';
import { RecurringNoticeDeliveryApplication } from '../../src/modules/recurring-notices/application/recurring-notice-delivery.application';
import { nextWeekSlot } from '../../src/modules/recurring-notices/domain/notice-dates';
import { RecurringDetectionApplication } from '../../src/modules/recurring/application/recurring-detection.application';
import { RecurringOverviewTool } from '../../src/modules/recurring/services/recurring-ask-vera.tool';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { MESSAGE_TYPES } from '../../src/shared/constants/queues.constants';
import { DateUtil } from '../../src/shared/utils/date.util';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const TODAY: string = DateUtil.todayInBrazil();
const DAY_MS: number = 86_400_000;
const AGES: readonly number[] = [95, 65, 35, 5];

interface ListBody {
    readonly seriesIds: readonly string[];
}

interface ChoiceBody {
    readonly seriesId: string;
    readonly enabled: boolean;
}

interface ProblemBody {
    readonly type: string;
}

interface SeriesRow {
    readonly id: string;
}

function plusDays(date: string, days: number): string {
    return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function monthBefore(date: string): string {
    const year: number = Number(date.slice(0, 4));
    const month: number = Number(date.slice(5, 7));
    const day: number = Number(date.slice(8, 10));
    const previous: Date = new Date(Date.UTC(year, month - 2, 1));
    const lastDay: number = new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 0)).getUTCDate();
    return `${String(previous.getUTCFullYear())}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

describe('avisos de recorrências por e-mail e ferramenta no WhatsApp', () => {
    let harness: AllocationHarness;
    let publisher: CapturingPublisher;
    let sent: EnqueueMailRequest[];
    let enqueue: MockInstance<(request: EnqueueMailRequest) => Promise<void>>;

    beforeAll(async () => {
        publisher = new CapturingPublisher();
        harness = await AllocationHarness.start('recurring_notices', publisher);
        enqueue = vi.spyOn(harness.app.get(MailerPort, { strict: false }), 'enqueue');
    });

    afterAll(async () => {
        await harness.stop();
    });

    beforeEach(() => {
        sent = [];
        publisher.published.length = 0;
        enqueue.mockReset();
        enqueue.mockImplementation((request: EnqueueMailRequest): Promise<void> => {
            sent.push(request);
            return Promise.resolve();
        });
    });

    async function confirmedSeries(owner: Account, nextOn: string): Promise<string> {
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const account = await harness.inCompany(owner.company.id, async () =>
            accounts.upsertProviderAccount({
                provider: 'pluggy',
                externalId: `card-${owner.company.id}`,
                kind: 'credit_card',
                name: 'Cartão Nubank',
                currency: 'BRL'
            })
        );
        const items: IncomingTransaction[] = AGES.map((age: number, index: number): IncomingTransaction => ({
            externalId: `nf-${String(index)}`,
            date: plusDays(TODAY, -age),
            amountMinor: -5590,
            currency: 'BRL',
            description: 'NETFLIX.COM'
        }));
        await harness.inCompany(owner.company.id, async () =>
            harness.app.get(TransactionIngestionService, { strict: false }).ingest({ accountId: account.id, source: 'pluggy', items })
        );
        await harness.inCompany(owner.company.id, async () =>
            harness.app.get(RecurringDetectionApplication, { strict: false }).detect(owner.company.id)
        );
        const rows = await harness.pg.query<SeriesRow>(`SELECT "id" FROM "RecurringSeries" WHERE "companyId" = $1`, [owner.company.id]);
        const id: string = rows.rows[0]?.id ?? '';
        await harness.call(owner.token, 'POST', `/spending/recurring/${id}/confirm`, {
            name: 'Netflix',
            cadence: 'monthly',
            expectedDay: Number(nextOn.slice(8, 10)),
            kind: 'subscription'
        });
        await harness.pg.query(`UPDATE "RecurringSeries" SET "lastDate" = $1 WHERE "id" = $2`, [monthBefore(nextOn), id]);
        return id;
    }

    async function asWorker<T>(fn: () => Promise<T>): Promise<T> {
        return harness.app.get(AppContext).run({ requestId: 'worker', locale: 'pt-BR' }, fn);
    }

    function delivery(): RecurringNoticeDeliveryApplication {
        return harness.app.get(RecurringNoticeDeliveryApplication, { strict: false });
    }

    it('qualquer papel liga e desliga o aviso da véspera, só em série confirmada, e a escolha é de cada pessoa', async () => {
        const owner: Account = await harness.signUp('prefs');
        const stranger: Account = await harness.signUp('prefs-other');
        const viewer: Account = await asRole(harness, owner, 'viewer');
        const nextOn: string = plusDays(TODAY, 2);
        const id: string = await confirmedSeries(owner, nextOn);

        const anonymous = await harness.call(null, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: true });
        const invalid = await harness.call(viewer.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: 'sim' });
        const missing = await harness.call<ProblemBody>(viewer.token, 'PUT', `/spending/recurring/${crypto.randomUUID()}/notice-before`, {
            enabled: true
        });
        const on = await harness.call<ChoiceBody>(viewer.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: true });
        const viewerList = await harness.call<ListBody>(viewer.token, 'GET', '/spending/recurring/notice-before');
        const ownerList = await harness.call<ListBody>(owner.token, 'GET', '/spending/recurring/notice-before');
        const strangerList = await harness.call<ListBody>(stranger.token, 'GET', '/spending/recurring/notice-before');
        const queued = publisher.ofType(MESSAGE_TYPES.recurringDueDue);
        const off = await harness.call<ChoiceBody>(viewer.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: false });
        const offAgain = await harness.call<ChoiceBody>(owner.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: false });
        const afterOff = await harness.call<ListBody>(viewer.token, 'GET', '/spending/recurring/notice-before');
        const stolen = await harness.call<ProblemBody>(stranger.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: true });

        expect([anonymous.status, invalid.status, missing.status, on.status, off.status, offAgain.status, stolen.status]).toEqual([
            401, 400, 404, 200, 200, 200, 404
        ]);
        expect(missing.body.type).toBe('recurring_notices.series_not_found');
        expect(on.body).toEqual({ seriesId: id, enabled: true });
        expect(viewerList.body.seriesIds).toEqual([id]);
        expect(ownerList.body.seriesIds).toEqual([]);
        expect(strangerList.body.seriesIds).toEqual([]);
        expect(afterOff.body.seriesIds).toEqual([]);
        expect(queued).toHaveLength(1);
        expect(queued[0]?.payload).toEqual({ companyId: owner.company.id, seriesId: id, userId: viewer.user.id, date: nextOn });
        expect(queued[0]?.options?.jobId).toBe(`recurring-due-${id}-${viewer.user.id}-${nextOn}`);
        expect(queued[0]?.options?.delayMs).toBeGreaterThan(0);
    });

    it('o resumo da segunda leva os débitos dos próximos 7 dias a cada pessoa, uma vez só, e respeita quem desligou o tipo', async () => {
        const owner: Account = await harness.signUp('week');
        const viewer: Account = await asRole(harness, owner, 'viewer');
        await confirmedSeries(owner, plusDays(TODAY, 2));
        const quiet: Account = await harness.signUp('week-empty');

        await asWorker(async () => delivery().sendWeek(owner.company.id, plusDays(TODAY, -1)));
        await asWorker(async () => delivery().sendWeek(quiet.company.id, TODAY));
        const beforeSend: number = sent.length;
        await asWorker(async () => delivery().sendWeek(owner.company.id, TODAY));
        const first: EnqueueMailRequest[] = [...sent];
        await asWorker(async () => delivery().sendWeek(owner.company.id, TODAY));

        expect(beforeSend).toBe(0);
        expect(first.map((mail: EnqueueMailRequest) => mail.template)).toEqual(['recurring-week', 'recurring-week']);
        expect(first.map((mail: EnqueueMailRequest) => mail.to.email).sort()).toEqual([owner.user.email, viewer.user.email].sort());
        expect(JSON.parse(first[0]?.props['entries'] ?? '[]')).toEqual([
            { date: plusDays(TODAY, 2), name: 'Netflix', amountMinor: 5590, estimate: false, card: true, account: 'Cartão Nubank' }
        ]);
        expect(first[0]?.props['totalMinor']).toBe('5590');
        expect(first[0]?.unsubscribeUrl).toContain('/notifications/unsubscribe/');
        expect(sent).toHaveLength(2);
    });

    it('quem desligou o tipo do resumo não recebe', async () => {
        const owner: Account = await harness.signUp('week-optout');
        const viewer: Account = await asRole(harness, owner, 'viewer');
        await confirmedSeries(owner, plusDays(TODAY, 2));
        await harness.call(viewer.token, 'PATCH', '/notifications/preferences', { type: 'recurring_week', enabled: false });

        await asWorker(async () => delivery().sendWeek(owner.company.id, TODAY));

        expect(sent.map((mail: EnqueueMailRequest) => mail.to.email)).toEqual([owner.user.email]);
    });

    it('a véspera sai só para quem ligou a série, no dia anterior ao débito, e não repete', async () => {
        const owner: Account = await harness.signUp('due');
        const viewer: Account = await asRole(harness, owner, 'viewer');
        const tomorrow: string = plusDays(TODAY, 1);
        const id: string = await confirmedSeries(owner, tomorrow);
        await harness.call(viewer.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: true });

        await asWorker(async () => delivery().sendDue(owner.company.id, id, owner.user.id, tomorrow));
        await asWorker(async () => delivery().sendDue(owner.company.id, id, viewer.user.id, plusDays(TODAY, 3)));
        await asWorker(async () => delivery().sendDue(owner.company.id, id, viewer.user.id, tomorrow));
        await asWorker(async () => delivery().sendDue(owner.company.id, id, viewer.user.id, tomorrow));

        expect(sent).toHaveLength(1);
        expect(sent[0]?.to.email).toBe(viewer.user.email);
        expect(sent[0]?.template).toBe('recurring-due');
        expect(sent[0]?.props).toMatchObject({
            name: 'Netflix',
            amountMinor: '5590',
            estimate: 'false',
            card: 'true',
            account: 'Cartão Nubank',
            lastDate: monthBefore(tomorrow)
        });
        await harness.call(viewer.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: false });
        sent.length = 0;
        await asWorker(async () => delivery().sendDue(owner.company.id, id, viewer.user.id, tomorrow));
        expect(sent).toHaveLength(0);
    });

    it('a tick diária pede o agendamento das companies com série confirmada e o agendamento põe a segunda e as vésperas na fila', async () => {
        const owner: Account = await harness.signUp('schedule');
        const nextOn: string = plusDays(TODAY, 2);
        const id: string = await confirmedSeries(owner, nextOn);
        await harness.call(owner.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: true });
        publisher.published.length = 0;

        const companies: number = await delivery().fanOutDaily();
        await asWorker(async () => delivery().scheduleCompany(owner.company.id));

        const schedules = publisher.ofType(MESSAGE_TYPES.recurringNoticesScheduleRequested);
        const weeks = publisher.ofType(MESSAGE_TYPES.recurringWeekDue);
        const dues = publisher.ofType(MESSAGE_TYPES.recurringDueDue);
        const slot = nextWeekSlot('America/Sao_Paulo', new Date());
        expect(companies).toBeGreaterThanOrEqual(1);
        expect(schedules.map((message) => message.payload)).toContainEqual({ companyId: owner.company.id });
        expect(weeks).toHaveLength(1);
        expect(weeks[0]?.payload).toEqual({ companyId: owner.company.id, monday: slot.monday });
        expect(weeks[0]?.options?.jobId).toBe(`recurring-week-${owner.company.id}-${slot.monday}`);
        expect(dues).toHaveLength(1);
        expect(dues[0]?.options?.jobId).toBe(`recurring-due-${id}-${owner.user.id}-${nextOn}`);
    });

    it('a saída da pessoa apaga a escolha dela e a exportação da conta leva as escolhas', async () => {
        const owner: Account = await harness.signUp('lifecycle');
        const viewer: Account = await asRole(harness, owner, 'viewer');
        const id: string = await confirmedSeries(owner, plusDays(TODAY, 2));
        await harness.call(viewer.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: true });
        await harness.call(owner.token, 'PUT', `/spending/recurring/${id}/notice-before`, { enabled: true });

        const sections = await harness.inCompany(owner.company.id, async () =>
            harness.app.get(AccountDataRegistry, { strict: false }).exportSections(owner.company.id)
        );
        await harness.inCompany(owner.company.id, async () =>
            harness.app.get(MemberDepartureRegistry, { strict: false }).notifyRemoved(viewer.user.id)
        );
        const rows = await harness.pg.query<{ userId: string }>(`SELECT "userId" FROM "RecurringNoticePrefs" WHERE "companyId" = $1`, [
            owner.company.id
        ]);

        const exported = (sections as Record<string, { preferences: { userId: string; seriesId: string; enabled: boolean }[] }>)[
            'recurring-notices'
        ];
        expect(exported?.preferences.map((row) => row.userId).sort()).toEqual([owner.user.id, viewer.user.id].sort());
        expect(rows.rows.map((row) => row.userId)).toEqual([owner.user.id]);
    });

    it('a ferramenta responde o que vence até domingo e quanto custam as assinaturas, só com o que a company confirmou', async () => {
        const owner: Account = await harness.signUp('tool');
        const empty: Account = await harness.signUp('tool-empty');
        await confirmedSeries(owner, TODAY);
        const tool: RecurringOverviewTool = harness.app.get(RecurringOverviewTool, { strict: false });
        const run = async (account: Account, input: unknown, locale: 'pt-BR' | 'en') =>
            harness.app
                .get(AppContext)
                .run({ requestId: 'tool', companyId: account.company.id, userId: account.user.id, locale }, async () => tool.run(input));

        const week = await run(owner, { topic: 'week' }, 'pt-BR');
        const defaulted = await run(owner, {}, 'pt-BR');
        const totals = await run(owner, { topic: 'subscriptions' }, 'en');
        const none = await run(empty, { topic: 'subscriptions' }, 'pt-BR');

        expect(week.text).toContain('Netflix');
        expect(week.text).toContain('até domingo');
        expect(defaulted.text).toBe(week.text);
        expect((totals.text ?? '').replace(/\s/g, ' ')).toBe('R$55.90 per month in 1 subscription, R$670.80 per year.');
        expect(none.text).toBe('Você ainda não confirmou nenhuma assinatura.');
        expect(tool.name).toBe('recurring_overview');
    });
});
