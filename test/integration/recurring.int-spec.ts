import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { RecurringDetectHandler } from '../../src/modules/recurring/access/queue/recurring-detect.handler';
import { RecurringDetectionApplication } from '../../src/modules/recurring/application/recurring-detection.application';
import { DetectionCounts } from '../../src/modules/recurring/services/recurring-log.service';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { TransactionImportService } from '../../src/modules/transactions/services/transaction-import.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { MESSAGE_TYPES } from '../../src/shared/constants/queues.constants';
import { DateUtil } from '../../src/shared/utils/date.util';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const TODAY: string = DateUtil.todayInBrazil();
const DAY_MS: number = 86_400_000;

interface SeriesBody {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly origin: string;
    readonly cadence: string;
    readonly kind: string;
    readonly expectedDay: number | null;
    readonly typicalAmountMinor: number;
    readonly snoozedUntil: string | null;
    readonly stoppedBy: string | null;
    readonly lastDate: string;
    readonly type?: string;
}

interface ConfirmBody {
    readonly series: SeriesBody;
    readonly categoryRule: { readonly created: boolean; readonly recategorized: number };
}

interface SeriesRow {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly merchantKey: string;
    readonly lastDate: string;
}

function daysAgo(days: number): string {
    return new Date(new Date(`${TODAY}T00:00:00Z`).getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

function monthly(prefix: string, description: string, amountMinor: number, ages: readonly number[]): IncomingTransaction[] {
    return ages.map((age: number, index: number) => ({
        externalId: `${prefix}-${String(index)}`,
        date: daysAgo(age),
        amountMinor,
        currency: 'BRL',
        description
    }));
}

const RECENT_AGES: readonly number[] = [95, 65, 35, 5];

describe('recurring', () => {
    let harness: AllocationHarness;
    let publisher: CapturingPublisher;
    let ingestion: TransactionIngestionService;
    let accounts: FinancialAccountService;
    let detection: RecurringDetectionApplication;

    beforeAll(async () => {
        publisher = new CapturingPublisher();
        harness = await AllocationHarness.start('recurring', publisher);
        ingestion = harness.app.get(TransactionIngestionService, { strict: false });
        accounts = harness.app.get(FinancialAccountService, { strict: false });
        detection = harness.app.get(RecurringDetectionApplication, { strict: false });
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function cardOf(owner: Account): Promise<string> {
        const created = await harness.inCompany(owner.company.id, async () =>
            accounts.upsertProviderAccount({
                provider: 'pluggy',
                externalId: `card-${owner.company.id}`,
                kind: 'credit_card',
                name: 'Cartão',
                currency: 'BRL'
            })
        );
        return created.id;
    }

    async function ingest(owner: Account, accountId: string, items: IncomingTransaction[]): Promise<void> {
        await harness.inCompany(owner.company.id, async () => ingestion.ingest({ accountId, source: 'pluggy', items }));
    }

    async function detect(owner: Account): Promise<DetectionCounts> {
        return harness.inCompany(owner.company.id, async () => detection.detect(owner.company.id));
    }

    async function seriesOf(owner: Account): Promise<SeriesRow[]> {
        const result = await harness.pg.query<SeriesRow>(
            `SELECT "id", "name", "status", "merchantKey", to_char("lastDate", 'YYYY-MM-DD') AS "lastDate"
               FROM "RecurringSeries" WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY "name"`,
            [owner.company.id]
        );
        return result.rows;
    }

    async function seeded(label: string): Promise<{ owner: Account; accountId: string }> {
        const owner: Account = await harness.signUp(label);
        const accountId: string = await cardOf(owner);
        await ingest(owner, accountId, [
            ...monthly('nf', 'NETFLIX.COM', -5590, RECENT_AGES),
            ...monthly('pil', 'STUDIO AURORA PILATES', -30000, RECENT_AGES)
        ]);
        return { owner, accountId };
    }

    function find(rows: readonly SeriesRow[], name: string): SeriesRow {
        const found: SeriesRow | undefined = rows.find((row: SeriesRow) => row.name === name);
        if (found === undefined) {
            throw new Error(`series ${name} not found`);
        }
        return found;
    }

    async function categoryId(owner: Account, systemKey: string): Promise<string> {
        const response = await harness.call<{ categories: { id: string; systemKey: string | null }[] }>(
            owner.token,
            'GET',
            '/spending/categories'
        );
        const found = response.body.categories.find((category) => category.systemKey === systemKey);
        if (found === undefined) {
            throw new Error(`category ${systemKey} not found`);
        }
        return found.id;
    }

    function confirmBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
        return { name: 'Minha série', cadence: 'monthly', expectedDay: 12, kind: 'subscription', ...extra };
    }

    it('a ingestão pede a detecção da company, com jobId da janela de 10 minutos e atraso até o fim dela', async () => {
        publisher.published.length = 0;
        const { owner } = await seeded('publish');

        const requests = publisher.ofType(MESSAGE_TYPES.recurringDetectRequested);

        expect(requests.length).toBeGreaterThan(0);
        expect(requests[0]?.payload).toEqual({ companyId: owner.company.id });
        expect(requests[0]?.options?.jobId).toMatch(new RegExp(`^recurring-detect-${owner.company.id}-\\d+$`));
        expect(requests[0]?.options?.delayMs).toBeGreaterThan(0);
        expect(requests[0]?.options?.delayMs).toBeLessThanOrEqual(600_000);
    });

    it('detecta as séries como sugestão, com as cobranças ligadas, e a segunda rodada não muda nada', async () => {
        const { owner } = await seeded('detect');

        const first: DetectionCounts = await detect(owner);
        const rows: SeriesRow[] = await seriesOf(owner);
        const second: DetectionCounts = await detect(owner);
        const after: SeriesRow[] = await seriesOf(owner);
        const links = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM "RecurringCharges" WHERE "companyId" = $1 AND "role" = 'charge' AND "deletedAt" IS NULL`,
            [owner.company.id]
        );

        expect(first).toMatchObject({ detected: 2, created: 2 });
        expect(rows.map((row: SeriesRow) => [row.name, row.status])).toEqual([
            ['Netflix', 'suggested'],
            ['Studio Aurora Pilates', 'suggested']
        ]);
        expect(Number(links.rows[0]?.total)).toBe(8);
        expect(second).toMatchObject({ created: 0, refreshed: 2, removed: 0 });
        expect(after.map((row: SeriesRow) => row.id)).toEqual(rows.map((row: SeriesRow) => row.id));
    });

    it('o job da fila roda a detecção da company do payload e ignora payload inválido', async () => {
        const { owner } = await seeded('handler');
        const handler: RecurringDetectHandler = harness.app.get(RecurringDetectHandler, { strict: false });
        const envelope = (payload: unknown) => ({
            type: MESSAGE_TYPES.recurringDetectRequested,
            requestId: 'test',
            companyId: null,
            occurredAt: new Date().toISOString(),
            trace: {},
            payload
        });

        const asWorker = async (payload: unknown): Promise<void> =>
            harness.app.get(AppContext).run({ requestId: 'worker', locale: 'pt-BR' }, async () => handler.handle(envelope(payload)));

        await asWorker({ companyId: 'not-a-uuid' });
        const before: SeriesRow[] = await seriesOf(owner);
        await asWorker({ companyId: owner.company.id });

        expect(before).toEqual([]);
        expect((await seriesOf(owner)).map((row: SeriesRow) => row.name)).toEqual(['Netflix', 'Studio Aurora Pilates']);
    });

    it('exige sessão e papel de edição: viewer lê e não revisa, editor e dono revisam', async () => {
        const { owner } = await seeded('roles');
        await detect(owner);
        const viewer: Account = await asRole(harness, owner, 'viewer');
        const editor: Account = await asRole(harness, owner, 'editor');
        const rows: SeriesRow[] = await seriesOf(owner);
        const id: string = find(rows, 'Netflix').id;
        const other: string = find(rows, 'Studio Aurora Pilates').id;

        const anonymous = await harness.call(null, 'POST', `/spending/recurring/${id}/dismiss`);
        const asViewer = await harness.call(viewer.token, 'POST', `/spending/recurring/${id}/confirm`, confirmBody());
        const viewerPatch = await harness.call(viewer.token, 'PATCH', `/spending/recurring/${id}`, { name: 'X' });
        const asEditor = await harness.call<ConfirmBody>(editor.token, 'POST', `/spending/recurring/${id}/confirm`, confirmBody());
        const asOwner = await harness.call<SeriesBody>(owner.token, 'POST', `/spending/recurring/${other}/snooze`);

        expect([anonymous.status, asViewer.status, viewerPatch.status, asEditor.status, asOwner.status]).toEqual([401, 403, 403, 200, 200]);
        expect(asEditor.body.series).toMatchObject({
            status: 'confirmed',
            name: 'Minha série',
            cadence: 'monthly',
            expectedDay: 12,
            kind: 'subscription'
        });
    });

    it('confirmar com "sempre para" salva a regra e recategoriza as passadas; categoria do dicionário não é mexida', async () => {
        const { owner } = await seeded('rule');
        await detect(owner);
        const rows: SeriesRow[] = await seriesOf(owner);
        const leisure: string = await categoryId(owner, 'leisure');

        const pilates = await harness.call<ConfirmBody>(
            owner.token,
            'POST',
            `/spending/recurring/${find(rows, 'Studio Aurora Pilates').id}/confirm`,
            confirmBody({ name: 'Pilates', kind: 'other', categoryId: leisure, createRule: true })
        );
        const netflix = await harness.call<ConfirmBody>(
            owner.token,
            'POST',
            `/spending/recurring/${find(rows, 'Netflix').id}/confirm`,
            confirmBody({ name: 'Netflix', categoryId: leisure, createRule: true })
        );
        const moved = await harness.pg.query<{ categoryId: string; categorySource: string }>(
            `SELECT "categoryId", "categorySource" FROM "Transactions" WHERE "companyId" = $1 AND "description" = 'STUDIO AURORA PILATES'`,
            [owner.company.id]
        );
        const kept = await harness.pg.query<{ systemKey: string }>(
            `SELECT c."systemKey" FROM "Transactions" t JOIN "SpendingCategories" c ON c."id" = t."categoryId"
              WHERE t."companyId" = $1 AND t."description" = 'NETFLIX.COM'`,
            [owner.company.id]
        );

        expect(pilates.body.categoryRule).toEqual({ created: true, recategorized: 4 });
        expect(moved.rows).toHaveLength(4);
        expect(moved.rows.every((row) => row.categoryId === leisure && row.categorySource === 'rule')).toBe(true);
        expect(netflix.body.categoryRule).toEqual({ created: false, recategorized: 0 });
        expect(kept.rows.every((row) => row.systemKey === 'subscriptions')).toBe(true);
    });

    it('categoryId sem "sempre para" e categoria de receita são recusados', async () => {
        const { owner } = await seeded('category');
        await detect(owner);
        const id: string = find(await seriesOf(owner), 'Netflix').id;

        const orphan = await harness.call<SeriesBody>(
            owner.token,
            'POST',
            `/spending/recurring/${id}/confirm`,
            confirmBody({ categoryId: await categoryId(owner, 'leisure') })
        );
        const income = await harness.call<SeriesBody>(
            owner.token,
            'POST',
            `/spending/recurring/${id}/confirm`,
            confirmBody({ categoryId: await categoryId(owner, 'income'), createRule: true })
        );

        expect(orphan.status).toBe(400);
        expect(income.status).toBe(422);
        expect(income.body.type).toBe('recurring.category_kind_mismatch');
    });

    it('"não é recorrente" suprime de vez, "desfazer" devolve a sugestão e só se confirma uma sugestão', async () => {
        const { owner } = await seeded('dismiss');
        await detect(owner);
        const id: string = find(await seriesOf(owner), 'Netflix').id;

        const dismissed = await harness.call<SeriesBody>(owner.token, 'POST', `/spending/recurring/${id}/dismiss`);
        const rerun: DetectionCounts = await detect(owner);
        const confirmDismissed = await harness.call<SeriesBody>(owner.token, 'POST', `/spending/recurring/${id}/confirm`, confirmBody());
        const afterRun: SeriesRow[] = await seriesOf(owner);
        const restored = await harness.call<SeriesBody>(owner.token, 'POST', `/spending/recurring/${id}/restore`);
        const suppressions = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM "RecurringSuppressions" WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
            [owner.company.id]
        );

        expect(dismissed.body.status).toBe('dismissed');
        expect(rerun.created).toBe(0);
        expect(afterRun.filter((row: SeriesRow) => row.merchantKey === 'NETFLIX')).toHaveLength(1);
        expect(confirmDismissed.status).toBe(409);
        expect(confirmDismissed.body.type).toBe('recurring.invalid_state');
        expect(restored.body.status).toBe('suggested');
        expect(Number(suppressions.rows[0]?.total)).toBe(0);
    });

    it('adiar esconde a sugestão por 30 dias sem mudar a situação', async () => {
        const { owner } = await seeded('snooze');
        await detect(owner);
        const id: string = find(await seriesOf(owner), 'Netflix').id;

        const snoozed = await harness.call<SeriesBody>(owner.token, 'POST', `/spending/recurring/${id}/snooze`);

        expect(snoozed.body.status).toBe('suggested');
        expect(snoozed.body.snoozedUntil).toBe(new Date(new Date(`${TODAY}T00:00:00Z`).getTime() + 30 * DAY_MS).toISOString().slice(0, 10));
    });

    it('editar guarda o que a pessoa mudou depois da próxima detecção; parar e desfazer voltam a confirmada', async () => {
        const { owner } = await seeded('edit');
        await detect(owner);
        const id: string = find(await seriesOf(owner), 'Netflix').id;
        await harness.call(owner.token, 'POST', `/spending/recurring/${id}/confirm`, confirmBody());

        const edited = await harness.call<SeriesBody>(owner.token, 'PATCH', `/spending/recurring/${id}`, {
            name: 'Netflix da casa',
            expectedDay: 20,
            cadence: 'bimonthly'
        });
        const empty = await harness.call<SeriesBody>(owner.token, 'PATCH', `/spending/recurring/${id}`, {});
        await detect(owner);
        const kept = (await harness.call<SeriesBody>(owner.token, 'PATCH', `/spending/recurring/${id}`, { kind: 'other' })).body;
        const stopped = await harness.call<SeriesBody>(owner.token, 'POST', `/spending/recurring/${id}/stop`);
        const editStopped = await harness.call<SeriesBody>(owner.token, 'PATCH', `/spending/recurring/${id}`, { name: 'Y' });
        const back = await harness.call<SeriesBody>(owner.token, 'POST', `/spending/recurring/${id}/restore`);

        expect(edited.body).toMatchObject({ name: 'Netflix da casa', expectedDay: 20, cadence: 'bimonthly' });
        expect(empty.status).toBe(400);
        expect(kept).toMatchObject({
            name: 'Netflix da casa',
            expectedDay: 20,
            cadence: 'bimonthly',
            kind: 'other',
            typicalAmountMinor: 5590
        });
        expect(stopped.body).toMatchObject({ status: 'stopped', stoppedBy: 'user' });
        expect(editStopped.status).toBe(409);
        expect(back.body).toMatchObject({ status: 'confirmed', stoppedBy: null });
    });

    it('tirar uma cobrança manda a transação para a lista de exclusão, recalcula a série e não aceita repetir', async () => {
        const { owner } = await seeded('exclude');
        await detect(owner);
        const id: string = find(await seriesOf(owner), 'Studio Aurora Pilates').id;
        const latest = await harness.pg.query<{ id: string }>(
            `SELECT t."id" FROM "RecurringCharges" c JOIN "Transactions" t ON t."id" = c."transactionId"
              WHERE c."seriesId" = $1 AND c."role" = 'charge' AND c."deletedAt" IS NULL ORDER BY t."date" DESC LIMIT 1`,
            [id]
        );
        const transactionId: string = latest.rows[0]?.id ?? '';
        const before: string = find(await seriesOf(owner), 'Studio Aurora Pilates').lastDate;

        const removed = await harness.call(owner.token, 'DELETE', `/spending/recurring/${id}/charges/${transactionId}`);
        const again = await harness.call<SeriesBody>(owner.token, 'DELETE', `/spending/recurring/${id}/charges/${transactionId}`);
        await detect(owner);
        const roles = await harness.pg.query<{ role: string }>(
            `SELECT "role" FROM "RecurringCharges" WHERE "seriesId" = $1 AND "transactionId" = $2 AND "deletedAt" IS NULL`,
            [id, transactionId]
        );

        expect(removed.status).toBe(204);
        expect(again.status).toBe(404);
        expect(again.body.type).toBe('recurring.charge_not_found');
        expect(roles.rows).toEqual([{ role: 'excluded' }]);
        expect(find(await seriesOf(owner), 'Studio Aurora Pilates').lastDate < before).toBe(true);
    });

    it('marcar como recorrente cria a série confirmada, devolve a mesma ao repetir e recusa entrada e id desconhecido', async () => {
        const { owner, accountId } = await seeded('manual');
        await ingest(owner, accountId, [
            { externalId: 'one', date: daysAgo(10), amountMinor: -45000, currency: 'BRL', description: 'OFICINA DO ZE' },
            { externalId: 'in', date: daysAgo(9), amountMinor: 120000, currency: 'BRL', description: 'SALARIO ACME' }
        ]);
        const ids = await harness.pg.query<{ externalId: string; id: string }>(
            `SELECT "externalId", "id" FROM "Transactions" WHERE "companyId" = $1 AND "externalId" IN ('one', 'in')`,
            [owner.company.id]
        );
        const idOf = (externalId: string): string => ids.rows.find((row) => row.externalId === externalId)?.id ?? '';

        const created = await harness.call<SeriesBody>(owner.token, 'POST', '/spending/recurring', { fromTransactionId: idOf('one') });
        const repeated = await harness.call<SeriesBody>(owner.token, 'POST', '/spending/recurring', { fromTransactionId: idOf('one') });
        const income = await harness.call<SeriesBody>(owner.token, 'POST', '/spending/recurring', { fromTransactionId: idOf('in') });
        const unknown = await harness.call<SeriesBody>(owner.token, 'POST', '/spending/recurring', {
            fromTransactionId: crypto.randomUUID()
        });

        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({
            status: 'confirmed',
            origin: 'manual',
            cadence: 'monthly',
            typicalAmountMinor: 45000,
            name: 'Oficina Do Ze'
        });
        expect(repeated.body.id).toBe(created.body.id);
        expect(income.body.type).toBe('recurring.transaction_not_eligible');
        expect(unknown.body.type).toBe('recurring.transaction_not_found');
    });

    it('marcar como recorrente uma cobrança que o detector já achou confirma a sugestão em vez de duplicar', async () => {
        const { owner } = await seeded('promote');
        await detect(owner);
        const suggested: SeriesRow = find(await seriesOf(owner), 'Netflix');
        const charge = await harness.pg.query<{ transactionId: string }>(
            `SELECT "transactionId" FROM "RecurringCharges" WHERE "seriesId" = $1 AND "role" = 'charge' AND "deletedAt" IS NULL LIMIT 1`,
            [suggested.id]
        );

        const promoted = await harness.call<SeriesBody>(owner.token, 'POST', '/spending/recurring', {
            fromTransactionId: charge.rows[0]?.transactionId
        });

        expect(promoted.body).toMatchObject({ id: suggested.id, status: 'confirmed' });
        expect(await seriesOf(owner)).toHaveLength(2);
    });

    it('a série confirmada sem cobrança dentro do prazo vai para parada pela Vera', async () => {
        const owner: Account = await harness.signUp('autostop');
        const accountId: string = await cardOf(owner);
        await ingest(owner, accountId, monthly('old', 'CLUBE DO VINHO', -8900, [200, 170, 140]));
        await detect(owner);
        const id: string = find(await seriesOf(owner), 'Clube Do Vinho').id;
        await harness.call(owner.token, 'POST', `/spending/recurring/${id}/confirm`, confirmBody({ kind: 'other' }));

        const counts: DetectionCounts = await detect(owner);

        expect(counts.stopped).toBe(1);
        expect(find(await seriesOf(owner), 'Minha série').status).toBe('stopped');
        const row = await harness.pg.query<{ stoppedBy: string }>(`SELECT "stoppedBy" FROM "RecurringSeries" WHERE "id" = $1`, [id]);
        expect(row.rows[0]?.stoppedBy).toBe('auto');
    });

    it('desfazer a importação e a nova ingestão pedem nova detecção, e a sugestão que perdeu as cobranças some', async () => {
        const owner: Account = await harness.signUp('undo');
        const accountId: string = await cardOf(owner);
        const imports: TransactionImportService = harness.app.get(TransactionImportService, { strict: false });
        const record = await harness.inCompany(owner.company.id, async () =>
            imports.record({ accountId, format: 'ofx', fileName: 'x.ofx', fileSha256: 'a'.repeat(64), rows: 4 })
        );
        await harness.inCompany(owner.company.id, async () =>
            ingestion.ingest({ accountId, source: 'ofx', importId: record.id, items: monthly('imp', 'CLUBE DO LIVRO', -4990, RECENT_AGES) })
        );
        await detect(owner);
        publisher.published.length = 0;

        await harness.inCompany(owner.company.id, async () => imports.undo(record.id));
        const counts: DetectionCounts = await detect(owner);

        expect(publisher.ofType(MESSAGE_TYPES.recurringDetectRequested)).toHaveLength(1);
        expect(counts.removed).toBe(1);
        expect(await seriesOf(owner)).toEqual([]);
    });

    it('uma company não enxerga nem altera a série da outra, e a detecção de uma não toca a outra', async () => {
        const mine = await seeded('mine');
        const theirs = await seeded('theirs');
        await detect(mine.owner);
        const foreign: string = find(await seriesOf(mine.owner), 'Netflix').id;

        const read = await harness.call<SeriesBody>(theirs.owner.token, 'PATCH', `/spending/recurring/${foreign}`, { name: 'X' });
        const confirm = await harness.call<SeriesBody>(theirs.owner.token, 'POST', `/spending/recurring/${foreign}/confirm`, confirmBody());
        const drop = await harness.call(theirs.owner.token, 'DELETE', `/spending/recurring/${foreign}/charges/${crypto.randomUUID()}`);

        expect([read.status, confirm.status, drop.status]).toEqual([404, 404, 404]);
        expect(await seriesOf(theirs.owner)).toEqual([]);
    });

    it('a rodada diária pede a detecção só das companies que têm série confirmada', async () => {
        const withSeries = await seeded('daily-yes');
        const without = await seeded('daily-no');
        await detect(withSeries.owner);
        await detect(without.owner);
        await harness.call(
            withSeries.owner.token,
            'POST',
            `/spending/recurring/${find(await seriesOf(withSeries.owner), 'Netflix').id}/confirm`,
            confirmBody()
        );
        publisher.published.length = 0;

        const queued: number = await detection.fanOutDaily();
        const payloads: unknown[] = publisher.ofType(MESSAGE_TYPES.recurringDetectRequested).map((message) => message.payload);

        expect(queued).toBeGreaterThanOrEqual(1);
        expect(payloads).toContainEqual({ companyId: withSeries.owner.company.id });
        expect(payloads).not.toContainEqual({ companyId: without.owner.company.id });
    });

    interface OverviewBody {
        readonly totals: {
            readonly monthlyMinor: number;
            readonly yearlyMinor: number;
            readonly byKind: { readonly subscription: number; readonly bill: number; readonly other: number };
            readonly suggestions: { readonly count: number; readonly monthlyMinor: number };
        };
        readonly review: {
            readonly name: string;
            readonly nextDate: string | null;
            readonly lastCharges: unknown[];
            readonly accountName: string;
        }[];
        readonly confirmed: { readonly name: string; readonly monthlyEquivalentMinor: number }[];
        readonly stopped: unknown[];
        readonly dismissed: unknown[];
        readonly alerts: {
            readonly id: string;
            readonly kind: string;
            readonly seriesName: string;
            readonly canMarkSeen: boolean;
            readonly data: Record<string, number | string>;
        }[];
    }

    interface CalendarBody {
        readonly date: string;
        readonly state: string;
        readonly name: string;
        readonly amountMinor: number;
        readonly isSuggestion: boolean;
        readonly accountKind: string;
    }

    async function raised(label: string): Promise<{ owner: Account; accountId: string }> {
        const owner: Account = await harness.signUp(label);
        const accountId: string = await cardOf(owner);
        await ingest(owner, accountId, [
            ...monthly('nf', 'NETFLIX.COM', -4490, [125, 95, 65, 35]),
            ...monthly('nfnew', 'NETFLIX.COM', -5590, [5])
        ]);
        return { owner, accountId };
    }

    it('a visão geral soma só as confirmadas, separa as sugestões e traz as últimas cobranças da revisão', async () => {
        const { owner } = await seeded('overview');
        await detect(owner);
        const netflix: string = find(await seriesOf(owner), 'Netflix').id;
        await harness.call(owner.token, 'POST', `/spending/recurring/${netflix}/confirm`, confirmBody({ name: 'Netflix' }));

        const response = await harness.call<OverviewBody>(owner.token, 'GET', '/spending/recurring');

        expect(response.status).toBe(200);
        expect(response.body.totals).toMatchObject({
            monthlyMinor: 5590,
            yearlyMinor: 67080,
            byKind: { subscription: 5590, bill: 0, other: 0 },
            suggestions: { count: 1, monthlyMinor: 30000 }
        });
        expect(response.body.confirmed.map((item) => [item.name, item.monthlyEquivalentMinor])).toEqual([['Netflix', 5590]]);
        expect(response.body.review.map((item) => item.name)).toEqual(['Studio Aurora Pilates']);
        expect(response.body.review[0]?.lastCharges).toHaveLength(3);
        expect(response.body.review[0]?.accountName).toBe('Cartão');
        expect(response.body.review[0]?.nextDate).not.toBeNull();
    });

    it('o aumento acima de 20% junta a série antiga com a cobrança nova e alerta; "Visto" some com o alerta', async () => {
        const { owner } = await raised('increase');
        await detect(owner);

        const before = await harness.call<OverviewBody>(owner.token, 'GET', '/spending/recurring');
        const alert = before.body.alerts.find((item) => item.kind === 'price_increase');
        const seen = await harness.call(owner.token, 'POST', `/spending/recurring/alerts/${alert?.id ?? ''}/seen`);
        const again = await harness.call(owner.token, 'POST', `/spending/recurring/alerts/${alert?.id ?? ''}/seen`);
        const after = await harness.call<OverviewBody>(owner.token, 'GET', '/spending/recurring');
        await detect(owner);
        const rerun = await harness.call<OverviewBody>(owner.token, 'GET', '/spending/recurring');

        expect(alert).toMatchObject({
            seriesName: 'Netflix',
            canMarkSeen: true,
            data: { fromAmountMinor: 4490, toAmountMinor: 5590, percent: 24 }
        });
        expect([seen.status, again.status]).toEqual([200, 200]);
        expect(after.body.alerts.filter((item) => item.kind === 'price_increase')).toEqual([]);
        expect(rerun.body.alerts.filter((item) => item.kind === 'price_increase')).toEqual([]);
    });

    it('a segunda cobrança no valor novo mantém o alerta de aumento, ancorado na primeira cobrança do valor novo', async () => {
        const { owner, accountId } = await raised('increase-gone');
        await detect(owner);
        await ingest(owner, accountId, monthly('nfmore', 'NETFLIX.COM', -5590, [1]));
        await detect(owner);

        const response = await harness.call<OverviewBody>(owner.token, 'GET', '/spending/recurring');

        const raisedAlerts = response.body.alerts.filter((item) => item.kind === 'price_increase');
        expect(raisedAlerts).toHaveLength(1);
        expect(raisedAlerts[0]).toMatchObject({ occurredOn: daysAgo(5) });
    });

    it('"Visto" só vale para o alerta da própria company e só para quem edita', async () => {
        const mine = await raised('seen-mine');
        const theirs = await seeded('seen-theirs');
        await detect(mine.owner);
        const alert = (await harness.call<OverviewBody>(mine.owner.token, 'GET', '/spending/recurring')).body.alerts[0];
        const viewer: Account = await asRole(harness, mine.owner, 'viewer');

        const foreign = await harness.call(theirs.owner.token, 'POST', `/spending/recurring/alerts/${alert?.id ?? ''}/seen`);
        const unknown = await harness.call(mine.owner.token, 'POST', `/spending/recurring/alerts/${crypto.randomUUID()}/seen`);
        const asViewer = await harness.call(viewer.token, 'POST', `/spending/recurring/alerts/${alert?.id ?? ''}/seen`);
        const anonymous = await harness.call(null, 'POST', `/spending/recurring/alerts/${alert?.id ?? ''}/seen`);
        const viewerReads = await harness.call(viewer.token, 'GET', '/spending/recurring');
        const theirOverview = await harness.call<OverviewBody>(theirs.owner.token, 'GET', '/spending/recurring');

        expect([foreign.status, unknown.status, asViewer.status, anonymous.status, viewerReads.status]).toEqual([404, 404, 403, 401, 200]);
        expect(theirOverview.body.alerts.map((item) => item.kind)).not.toContain('price_increase');
    });

    it('o calendário traz as próximas cobranças das confirmadas e das sugeridas, com o tipo da conta', async () => {
        const { owner } = await seeded('calendar');
        await detect(owner);
        const netflix: string = find(await seriesOf(owner), 'Netflix').id;
        await harness.call(owner.token, 'POST', `/spending/recurring/${netflix}/confirm`, confirmBody({ name: 'Netflix' }));

        const response = await harness.call<CalendarBody[]>(owner.token, 'GET', '/spending/recurring/calendar?days=45');
        const names: string[] = response.body.map((entry: CalendarBody) => entry.name);

        expect(response.status).toBe(200);
        expect(new Set(names)).toEqual(new Set(['Netflix', 'Studio Aurora Pilates']));
        expect(response.body.every((entry: CalendarBody) => entry.accountKind === 'credit_card')).toBe(true);
        expect(response.body.find((entry: CalendarBody) => entry.name === 'Netflix')).toMatchObject({
            amountMinor: 5590,
            isSuggestion: false
        });
        expect(response.body.find((entry: CalendarBody) => entry.name === 'Studio Aurora Pilates')?.isSuggestion).toBe(true);
        expect(response.body.map((entry: CalendarBody) => entry.date)).toEqual(
            response.body.map((entry: CalendarBody) => entry.date).toSorted()
        );
    });

    it('o calendário recusa horizonte fora de 1 a 90 dias e não mostra série da outra company', async () => {
        const mine = await seeded('calendar-bounds');
        const theirs = await seeded('calendar-other');
        await detect(mine.owner);

        const zero = await harness.call(mine.owner.token, 'GET', '/spending/recurring/calendar?days=0');
        const huge = await harness.call(mine.owner.token, 'GET', '/spending/recurring/calendar?days=91');
        const foreign = await harness.call<CalendarBody[]>(theirs.owner.token, 'GET', '/spending/recurring/calendar');

        expect([zero.status, huge.status]).toEqual([400, 400]);
        expect(foreign.body).toEqual([]);
    });

    interface ListedTransaction {
        readonly description: string;
        readonly isRecurring: boolean;
    }

    it('a lista de transações marca com o selo só as cobranças de série confirmada, não as da sugestão', async () => {
        const { owner } = await seeded('badge');
        await detect(owner);
        const netflix: string = find(await seriesOf(owner), 'Netflix').id;
        await harness.call(owner.token, 'POST', `/spending/recurring/${netflix}/confirm`, confirmBody({ name: 'Netflix' }));

        const listed = await harness.call<{ data: ListedTransaction[] }>(
            owner.token,
            'GET',
            `/spending/transactions?from=${daysAgo(100)}&to=${TODAY}&pageSize=200`
        );

        expect(listed.status).toBe(200);
        const flags = (description: string): boolean[] =>
            listed.body.data.filter((item) => item.description === description).map((item) => item.isRecurring);
        expect(flags('NETFLIX.COM')).toEqual([true, true, true, true]);
        expect(flags('STUDIO AURORA PILATES')).toEqual([false, false, false, false]);
    });

    it('a série confirmada de uma company não põe selo nas transações da outra', async () => {
        const mine = await seeded('badge-undo');
        const theirs = await seeded('badge-foreign');
        await detect(mine.owner);
        await detect(theirs.owner);
        const netflix: string = find(await seriesOf(theirs.owner), 'Netflix').id;
        await harness.call(theirs.owner.token, 'POST', `/spending/recurring/${netflix}/confirm`, confirmBody({ name: 'Netflix' }));

        const listed = await harness.call<{ data: ListedTransaction[] }>(
            mine.owner.token,
            'GET',
            `/spending/transactions?from=${daysAgo(100)}&to=${TODAY}&pageSize=200`
        );

        expect(listed.body.data.length).toBeGreaterThan(0);
        expect(listed.body.data.every((item) => !item.isRecurring)).toBe(true);
    });

    it('os dados de exemplo ganham séries sugeridas, e limpar o exemplo apaga séries, cobranças e supressões', async () => {
        const owner: Account = await harness.signUp('sample-series');

        const loaded = await harness.call(owner.token, 'POST', '/onboarding/sample');
        const overview = await harness.call<OverviewBody>(owner.token, 'GET', '/spending/recurring');
        const names: string[] = overview.body.review.map((item) => item.name);
        const dismissed = await harness.call(
            owner.token,
            'POST',
            `/spending/recurring/${find(await seriesOf(owner), 'Netflix').id}/dismiss`
        );
        const cleared = await harness.call(owner.token, 'DELETE', '/onboarding/sample');
        const after = await harness.call<OverviewBody>(owner.token, 'GET', '/spending/recurring');
        const leftovers = await harness.pg.query<{ table: string; total: string }>(
            `SELECT 'series' AS "table", count(*) AS total FROM "RecurringSeries" WHERE "companyId" = $1 AND "deletedAt" IS NULL
             UNION ALL SELECT 'charges', count(*) FROM "RecurringCharges" WHERE "companyId" = $1 AND "deletedAt" IS NULL
             UNION ALL SELECT 'suppressions', count(*) FROM "RecurringSuppressions" WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
            [owner.company.id]
        );

        expect(loaded.status).toBe(200);
        expect(names).toEqual(expect.arrayContaining(['Netflix', 'Spotify']));
        expect(dismissed.status).toBe(200);
        expect(cleared.status).toBe(200);
        expect([after.body.review, after.body.confirmed]).toEqual([[], []]);
        expect(leftovers.rows.map((row) => [row.table, Number(row.total)])).toEqual([
            ['series', 0],
            ['charges', 0],
            ['suppressions', 0]
        ]);
    });
});
