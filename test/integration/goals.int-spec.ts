import { Workbook, Worksheet } from 'exceljs';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { addMonths, monthOfDate } from '../../src/modules/spending-summary/domain/month';
import { DateUtil } from '../../src/shared/utils/date.util';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness, RawResponse } from './support/allocation-harness';
import { seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

const TODAY: string = DateUtil.todayInBrazil();
const NEXT_YEAR: string = `${String(Number(TODAY.slice(0, 4)) + 1)}-06-15`;

interface HoldingLink {
    readonly kind: string;
    readonly holdingId: string;
    readonly shareBps: number;
    readonly removed?: boolean;
    readonly valueMinor?: number | null;
}

interface GoalBody {
    readonly id: string;
    readonly type?: string;
    readonly status: string | number;
    readonly name: string;
    readonly targetMinor: number;
    readonly manualMinor: number;
    readonly balanceMinor: number;
    readonly remainingMinor: number;
    readonly monthlyMinor: number;
    readonly monthsRemaining: number;
    readonly monthDeltaMinor: number | null;
    readonly removedHoldings: number;
    readonly holderUserId: string | null;
    readonly holdings: HoldingLink[];
    readonly meta?: { readonly freeBps?: number; readonly goalId?: string };
}

interface ListBody {
    readonly items: GoalBody[];
    readonly totals: { count: number; monthlyNeededMinor: number; onTrackCount: number; behindCount: number; doneCount: number };
}

interface SuggestionBody {
    readonly months: number;
    readonly averageMinor: number | null;
    readonly averageMonths: string[];
    readonly suggestedMinor: number | null;
    readonly type?: string;
}

interface ReserveBody extends GoalBody {
    readonly reserve: {
        months: number;
        baseMinor: number;
        averageMinor: number | null;
        suggestedMinor: number | null;
        shouldUpdate: boolean;
    } | null;
}

interface IdBody {
    readonly id: string;
    readonly valueMinor?: number;
}

describe('goals', () => {
    let harness: AllocationHarness;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('goals', new CapturingPublisher());
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        const from: string = addDays(TODAY, -800);
        await sync.syncWindow({ series: 'cdi_daily', from, to: TODAY });
        await sync.syncWindow({ series: 'ipca_monthly', from, to: TODAY });
        assetIds = await seedPrototypeAssets(harness);
        await seedUsdRate(harness);
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function addPosition(account: Account, symbol: string): Promise<string> {
        const response = await harness.call<IdBody>(account.token, 'POST', '/positions', { assetId: assetIds[symbol], quantity: '100' });
        expect(response.status).toBe(201);
        return response.body.id;
    }

    async function valueOf(account: Account, positionId: string): Promise<number> {
        const response = await harness.call<{ data: { id: string; valueMinor: number }[] }>(account.token, 'GET', '/portfolio/holdings');
        return response.body.data.find((item) => item.id === positionId)?.valueMinor ?? 0;
    }

    async function addTitle(account: Account): Promise<string> {
        const response = await harness.call<IdBody>(account.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name: 'CDB',
            issuerId: 'banco-pan',
            indexer: 'prefixed',
            rateBps: 1200,
            appliedMinor: 500_000,
            appliedAt: addDays(TODAY, -30),
            maturityDate: addDays(TODAY, 300)
        });
        expect(response.status).toBe(201);
        return response.body.id;
    }

    async function create(account: Account, overrides: Record<string, unknown> = {}): Promise<{ status: number; body: GoalBody }> {
        return harness.call<GoalBody>(account.token, 'POST', '/goals', {
            kind: 'travel',
            name: 'Viagem',
            targetMinor: 1_200_000,
            targetDate: NEXT_YEAR,
            holdings: [],
            ...overrides
        });
    }

    it('exige sessão e respeita os papéis: leitura só lê, edição escreve', async () => {
        const owner: Account = await harness.signUp('roles');
        const viewer: Account = await asRole(harness, owner, 'viewer');
        const editor: Account = await asRole(harness, owner, 'editor');
        const id: string = crypto.randomUUID();

        const anonymous: number[] = await Promise.all(
            [
                harness.call(null, 'GET', '/goals'),
                harness.call(null, 'POST', '/goals', {}),
                harness.call(null, 'GET', `/goals/${id}`),
                harness.call(null, 'PATCH', `/goals/${id}`, {}),
                harness.call(null, 'DELETE', `/goals/${id}`)
            ].map(async (call) => (await call).status)
        );
        const created = await create(editor);
        const viewerWrites: number[] = [
            (await create(viewer)).status,
            (await harness.call(viewer.token, 'PATCH', `/goals/${created.body.id}`, { name: 'x' })).status,
            (await harness.call(viewer.token, 'DELETE', `/goals/${created.body.id}`)).status
        ];
        const viewerReads: number[] = [
            (await harness.call(viewer.token, 'GET', '/goals')).status,
            (await harness.call(viewer.token, 'GET', `/goals/${created.body.id}`)).status
        ];

        expect(anonymous).toEqual([401, 401, 401, 401, 401]);
        expect(created.status).toBe(201);
        expect(viewerWrites).toEqual([403, 403, 403]);
        expect(viewerReads).toEqual([200, 200]);
    });

    it('calcula saldo, falta e por mês com o valor manual e a parte de um ativo e de um título', async () => {
        const owner: Account = await harness.signUp('balance');
        const positionId: string = await addPosition(owner, 'PETR4');
        const titleId: string = await addTitle(owner);
        const positionValue: number = await valueOf(owner, positionId);

        const created = await create(owner, {
            manualMinor: 100_000,
            holdings: [
                { kind: 'position', holdingId: positionId, shareBps: 2500 },
                { kind: 'fixed_income', holdingId: titleId, shareBps: 10000 }
            ]
        });

        expect(created.status).toBe(201);
        const position: HoldingLink | undefined = created.body.holdings.find((link) => link.kind === 'position');
        const title: HoldingLink | undefined = created.body.holdings.find((link) => link.kind === 'fixed_income');
        expect(position?.valueMinor).toBe(Math.round(positionValue * 0.25));
        expect(title?.valueMinor).toBeGreaterThan(400_000);
        expect(created.body.balanceMinor).toBe(100_000 + (position?.valueMinor ?? 0) + (title?.valueMinor ?? 0));
        expect(created.body.remainingMinor).toBe(1_200_000 - created.body.balanceMinor);
        expect(created.body.monthlyMinor).toBe(Math.ceil(created.body.remainingMinor / created.body.monthsRemaining));
        expect(created.body.status).toBe('on_track');
        expect(created.body.monthDeltaMinor).toBe(0);
        const listed = await harness.call<ListBody>(owner.token, 'GET', '/goals');
        expect(listed.body.totals).toMatchObject({ count: 1, onTrackCount: 1, behindCount: 0, doneCount: 0 });
        expect(listed.body.totals.monthlyNeededMinor).toBe(created.body.monthlyMinor);
    });

    it('marca o objetivo como concluído quando o saldo alcança o valor', async () => {
        const owner: Account = await harness.signUp('done');

        const created = await create(owner, { targetMinor: 50_000, manualMinor: 50_000 });

        expect(created.body).toMatchObject({ status: 'done', remainingMinor: 0, monthlyMinor: 0 });
        const listed = await harness.call<ListBody>(owner.token, 'GET', '/goals');
        expect(listed.body.totals).toMatchObject({ doneCount: 1, monthlyNeededMinor: 0 });
    });

    it('não deixa a soma das partes de um ativo passar de 100% entre objetivos e libera a parte ao remover', async () => {
        const owner: Account = await harness.signUp('overallocated');
        const positionId: string = await addPosition(owner, 'ITUB4');
        const first = await create(owner, { name: 'A', holdings: [{ kind: 'position', holdingId: positionId, shareBps: 6000 }] });

        const refused = await create(owner, { name: 'B', holdings: [{ kind: 'position', holdingId: positionId, shareBps: 5000 }] });
        const fits = await create(owner, { name: 'B', holdings: [{ kind: 'position', holdingId: positionId, shareBps: 4000 }] });
        const raise = await harness.call<GoalBody>(owner.token, 'PATCH', `/goals/${first.body.id}`, {
            holdings: [{ kind: 'position', holdingId: positionId, shareBps: 6001 }]
        });
        const lower = await harness.call<GoalBody>(owner.token, 'PATCH', `/goals/${first.body.id}`, {
            holdings: [{ kind: 'position', holdingId: positionId, shareBps: 3000 }]
        });
        await harness.call(owner.token, 'DELETE', `/goals/${fits.body.id}`);
        const afterRemoval = await create(owner, { name: 'C', holdings: [{ kind: 'position', holdingId: positionId, shareBps: 7000 }] });

        expect(first.status).toBe(201);
        expect(refused.status).toBe(409);
        expect(refused.body.type).toBe('goals.holding_overallocated');
        expect(refused.body.meta?.freeBps).toBe(4000);
        expect(fits.status).toBe(201);
        expect(raise.status).toBe(409);
        expect(lower.status).toBe(200);
        expect(lower.body.holdings).toHaveLength(1);
        expect(afterRemoval.status).toBe(201);
    });

    it('recusa vínculo a um ativo que não está na carteira da company', async () => {
        const owner: Account = await harness.signUp('foreign');
        const other: Account = await harness.signUp('foreign-other');
        const foreign: string = await addPosition(other, 'WEGE3');

        const unknown = await create(owner, { holdings: [{ kind: 'position', holdingId: crypto.randomUUID(), shareBps: 100 }] });
        const crossTenant = await create(owner, { holdings: [{ kind: 'position', holdingId: foreign, shareBps: 100 }] });
        const wrongKind = await create(owner, { holdings: [{ kind: 'fixed_income', holdingId: foreign, shareBps: 100 }] });

        expect([unknown.status, crossTenant.status, wrongKind.status]).toEqual([404, 404, 404]);
        expect(crossTenant.body.type).toBe('goals.holding_not_found');
    });

    it('permite uma reserva de emergência por titular e valida o titular', async () => {
        const owner: Account = await harness.signUp('reserve');
        const ana: Account = await asRole(harness, owner, 'editor');
        const stranger: Account = await harness.signUp('reserve-stranger');

        const whole = await create(owner, { kind: 'emergency_reserve', name: 'Reserva' });
        const repeated = await create(owner, { kind: 'emergency_reserve', name: 'Outra' });
        const hers = await create(owner, { kind: 'emergency_reserve', name: 'Reserva da Ana', holderUserId: ana.user.id });
        const moved = await harness.call<GoalBody>(owner.token, 'PATCH', `/goals/${hers.body.id}`, { holderUserId: null });
        const outsider = await create(owner, { holderUserId: stranger.user.id });
        const byHolder = await harness.call<ListBody>(owner.token, 'GET', `/goals?holder=${ana.user.id}`);

        expect([whole.status, repeated.status, hers.status]).toEqual([201, 409, 201]);
        expect(repeated.body.type).toBe('goals.emergency_reserve_exists');
        expect(repeated.body.meta?.goalId).toBe(whole.body.id);
        expect(moved.status).toBe(409);
        expect(outsider.status).toBe(422);
        expect(outsider.body.type).toBe('members.invalid_holder');
        expect(byHolder.body.items.map((item) => item.name)).toEqual(['Reserva da Ana']);
    });

    it('recusa data que não é futura, valores inválidos e passa do limite de 20 objetivos', async () => {
        const owner: Account = await harness.signUp('limits');

        const past = await create(owner, { targetDate: TODAY });
        const invalid = await Promise.all([
            create(owner, { targetMinor: 0 }),
            create(owner, { targetMinor: 10.5 }),
            create(owner, { targetDate: '2030-02-31' }),
            create(owner, { name: '' }),
            create(owner, { holdings: [{ kind: 'position', holdingId: crypto.randomUUID(), shareBps: 10001 }] })
        ]);
        for (let index = 0; index < 20; index++) {
            expect((await create(owner, { name: `Objetivo ${String(index)}` })).status).toBe(201);
        }
        const beyond = await create(owner, { name: 'Vigésimo primeiro' });

        expect(past.status).toBe(422);
        expect(past.body.type).toBe('goals.target_date_in_past');
        expect(invalid.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
        expect(beyond.status).toBe(422);
        expect(beyond.body.type).toBe('goals.limit_reached');
    });

    it('edita nome, valor e manual, recomeça o plano e refaz o cálculo', async () => {
        const owner: Account = await harness.signUp('edit');
        const created = await create(owner, { manualMinor: 200_000 });

        const edited = await harness.call<GoalBody>(owner.token, 'PATCH', `/goals/${created.body.id}`, {
            name: 'Viagem ao Japão',
            targetMinor: 2_000_000,
            manualMinor: 500_000
        });
        const back = await harness.call<GoalBody>(owner.token, 'GET', `/goals/${created.body.id}`);

        expect(edited.status).toBe(200);
        expect(edited.body).toMatchObject({ name: 'Viagem ao Japão', targetMinor: 2_000_000, balanceMinor: 500_000, status: 'on_track' });
        expect(edited.body.remainingMinor).toBe(1_500_000);
        expect(back.body.balanceMinor).toBe(500_000);
        expect((await harness.call<GoalBody>(owner.token, 'PATCH', `/goals/${created.body.id}`, { targetDate: TODAY })).status).toBe(422);
    });

    it('mostra o ativo removido da carteira como removido e tira a parte dele do saldo', async () => {
        const owner: Account = await harness.signUp('removed');
        const positionId: string = await addPosition(owner, 'KNRI11');
        const created = await create(owner, {
            manualMinor: 1000,
            holdings: [{ kind: 'position', holdingId: positionId, shareBps: 10000 }]
        });
        expect(created.body.balanceMinor).toBeGreaterThan(1000);

        await harness.call(owner.token, 'DELETE', `/positions/${positionId}`);
        const after = await harness.call<GoalBody>(owner.token, 'GET', `/goals/${created.body.id}`);

        expect(after.body).toMatchObject({ balanceMinor: 1000, removedHoldings: 1 });
        expect(after.body.holdings[0]).toMatchObject({ removed: true, valueMinor: null });
    });

    it('isola os objetivos por company e apaga em cascata com a conta', async () => {
        const owner: Account = await harness.signUp('isolation-a');
        const other: Account = await harness.signUp('isolation-b');
        const created = await create(owner, { name: 'Só da A' });

        const foreignRead = await harness.call<GoalBody>(other.token, 'GET', `/goals/${created.body.id}`);
        const foreignPatch = await harness.call<GoalBody>(other.token, 'PATCH', `/goals/${created.body.id}`, { name: 'invadido' });
        const foreignDelete = await harness.call(other.token, 'DELETE', `/goals/${created.body.id}`);
        const foreignList = await harness.call<ListBody>(other.token, 'GET', '/goals');
        const own = await harness.call<GoalBody>(owner.token, 'GET', `/goals/${created.body.id}`);

        expect([foreignRead.status, foreignPatch.status, foreignDelete.status]).toEqual([404, 404, 404]);
        expect(foreignRead.body.type).toBe('goals.goal_not_found');
        expect(foreignList.body.items).toEqual([]);
        expect(own.body.name).toBe('Só da A');
        const removed = await harness.call(owner.token, 'DELETE', `/goals/${created.body.id}`);
        expect(removed.status).toBe(204);
        expect((await harness.call(owner.token, 'GET', `/goals/${created.body.id}`)).status).toBe(404);
    });

    async function spend(owner: Account, key: string, amountsByMonthsAgo: Record<number, number>): Promise<void> {
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const ingestion: TransactionIngestionService = harness.app.get(TransactionIngestionService, { strict: false });
        const currentMonth: string = monthOfDate(TODAY);
        const account = await harness.inCompany(owner.company.id, async () =>
            accounts.upsertProviderAccount({
                provider: 'pluggy',
                externalId: `acc-${key}`,
                kind: 'checking',
                name: 'Conta',
                institutionName: 'Banco',
                numberLast4: '1234',
                currency: 'BRL'
            })
        );
        const items = Object.entries(amountsByMonthsAgo).map(([ago, amountMinor]) => ({
            externalId: `pluggy:${key}-${ago}`,
            date: `${addMonths(currentMonth, -Number(ago))}-15`,
            amountMinor: -amountMinor,
            currency: 'BRL',
            description: 'Compra do mes',
            counterpartyName: null,
            counterpartyDocument: null,
            providerCategoryId: null
        }));
        await harness.inCompany(owner.company.id, async () =>
            ingestion.ingest({ accountId: account.id, source: 'pluggy', importId: null, items })
        );
    }

    it('sugere a reserva pela média dos gastos dos meses fechados, sem dados pede o valor e lê em qualquer papel', async () => {
        const owner: Account = await harness.signUp('reserve-suggestion');
        const viewer: Account = await asRole(harness, owner, 'viewer');

        const empty = await harness.call<SuggestionBody>(viewer.token, 'GET', '/goals/emergency-suggestion');
        await spend(owner, 'main', { 1: 500_000, 2: 520_000, 3: 540_000, 0: 9_999_999 });
        const six = await harness.call<SuggestionBody>(viewer.token, 'GET', '/goals/emergency-suggestion');
        const twelve = await harness.call<SuggestionBody>(owner.token, 'GET', '/goals/emergency-suggestion?months=12');
        const invalid = await harness.call<SuggestionBody>(owner.token, 'GET', '/goals/emergency-suggestion?months=5');
        const anonymous = await harness.call(null, 'GET', '/goals/emergency-suggestion');

        expect(empty.status).toBe(200);
        expect(empty.body).toEqual({ months: 6, averageMinor: null, averageMonths: [], suggestedMinor: null });
        expect(six.body).toMatchObject({ months: 6, averageMinor: 520_000, suggestedMinor: 3_120_000 });
        expect(six.body.averageMonths).toEqual([-3, -2, -1].map((delta) => addMonths(monthOfDate(TODAY), delta)));
        expect(twelve.body).toMatchObject({ months: 12, suggestedMinor: 6_240_000 });
        expect([invalid.status, anonymous.status]).toEqual([400, 401]);
    });

    it('guarda a base da reserva, avisa quando a média passa de 10% e o alvo só muda quando a pessoa atualiza', async () => {
        const owner: Account = await harness.signUp('reserve-review');
        await spend(owner, 'main', { 1: 500_000, 2: 520_000, 3: 540_000 });
        const created = await create(owner, { kind: 'emergency_reserve', name: 'Reserva', targetMinor: 3_120_000, reserveMonths: 6 });

        const before = await harness.call<ReserveBody>(owner.token, 'GET', `/goals/${created.body.id}`);
        await spend(owner, 'extra', { 1: 300_000 });
        const after = await harness.call<ReserveBody>(owner.token, 'GET', `/goals/${created.body.id}`);
        const listed = await harness.call<{ items: ReserveBody[] }>(owner.token, 'GET', '/goals');
        const updated = await harness.call<ReserveBody>(owner.token, 'PATCH', `/goals/${created.body.id}`, {
            targetMinor: after.body.reserve?.suggestedMinor
        });

        expect(created.status).toBe(201);
        expect(before.body.reserve).toMatchObject({ months: 6, baseMinor: 520_000, averageMinor: 520_000, shouldUpdate: false });
        expect(after.body.targetMinor).toBe(3_120_000);
        expect(after.body.reserve).toMatchObject({
            baseMinor: 520_000,
            averageMinor: 620_000,
            suggestedMinor: 3_720_000,
            shouldUpdate: true
        });
        expect(listed.body.items[0]?.reserve?.shouldUpdate).toBe(true);
        expect(updated.body.targetMinor).toBe(3_720_000);
        expect(updated.body.reserve).toMatchObject({ baseMinor: 620_000, shouldUpdate: false });
    });

    it('recusa os meses da reserva em objetivo que não é reserva e deixa a reserva sem base quando não vêm os meses', async () => {
        const owner: Account = await harness.signUp('reserve-kinds');

        const travel = await create(owner, { reserveMonths: 6 });
        const plain = await create(owner, { kind: 'emergency_reserve', name: 'Reserva' });
        const invalid = await create(owner, { kind: 'emergency_reserve', name: 'Outra', reserveMonths: 5 });

        expect([travel.status, plain.status, invalid.status]).toEqual([422, 201, 400]);
        expect(travel.body.type).toBe('goals.reserve_months_not_allowed');
        expect((plain.body as ReserveBody).reserve).toBeNull();
    });
    interface ExportBody {
        readonly sections: {
            readonly goals?: {
                readonly goals: { readonly name: string; readonly holderUserId: string | null }[];
                readonly goalHoldings: { readonly holdingId: string; readonly shareBps: number }[];
            };
        };
    }

    async function team(label: string): Promise<{ owner: Account; ana: Account }> {
        const owner: Account = await harness.signUp(label);
        return { owner, ana: await asRole(harness, owner, 'editor') };
    }

    async function rowsOf(zip: JSZip, file: string, sheet: number): Promise<unknown[][]> {
        const workbook: Workbook = new Workbook();
        await workbook.xlsx.load(
            (await (zip.file(file) as JSZip.JSZipObject).async('nodebuffer')) as unknown as Parameters<Workbook['xlsx']['load']>[0]
        );
        const worksheet: Worksheet = workbook.worksheets[sheet] as Worksheet;
        const rows: unknown[][] = [];
        worksheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
        return rows;
    }

    it('Exportar tudo: leva os objetivos e os vínculos da company, nas duas abas, e só o dono baixa', async () => {
        const { owner } = await team('export-a');
        const other: Account = await harness.signUp('export-b');
        const positionId: string = await addPosition(owner, 'PETR4');
        await create(owner, { name: 'Viagem da A', holdings: [{ kind: 'position', holdingId: positionId, shareBps: 2500 }] });
        await create(other, { name: 'Da B' });

        const json = await harness.call<ExportBody>(owner.token, 'GET', '/account/export');
        const sheets: RawResponse = await harness.callRaw(owner.token, '/account/export/spreadsheets');
        const editor: Account = await asRole(harness, owner, 'editor');

        expect(json.body.sections.goals?.goals.map((goal) => goal.name)).toEqual(['Viagem da A']);
        expect(json.body.sections.goals?.goalHoldings).toEqual([expect.objectContaining({ holdingId: positionId, shareBps: 2500 })]);
        const zip: JSZip = await JSZip.loadAsync(sheets.bytes);
        const goals: unknown[][] = await rowsOf(zip, 'objetivos.xlsx', 0);
        const links: unknown[][] = await rowsOf(zip, 'objetivos.xlsx', 1);
        expect(goals.map((row) => [row[0], row[1], row[5], row[6]])).toEqual([
            ['Objetivo', 'Tipo', 'Situação', 'Titular'],
            ['Viagem da A', 'Viagem', 'Em dia', 'Conta toda']
        ]);
        expect(links.map((row) => [row[0], row[1]])).toEqual([
            ['Objetivo', 'Ativo'],
            ['Viagem da A', expect.any(String)]
        ]);
        expect((await harness.callRaw(editor.token, '/account/export/spreadsheets')).status).toBe(403);
    });

    it('dados de exemplo: carrega a reserva em dia e a viagem atrasada, marcadas, sem duplicar, fora da exportação, e limpa', async () => {
        const owner: Account = await harness.signUp('sample');

        await harness.call(owner.token, 'POST', '/onboarding/sample');
        await harness.call(owner.token, 'POST', '/onboarding/sample');

        const list = await harness.call<ListBody>(owner.token, 'GET', '/goals');
        expect(list.body.items.map((item) => [item.name, item.status]).toSorted()).toEqual([
            ['Reserva de emergência', 'on_track'],
            ['Viagem', 'behind']
        ]);
        const marked = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM "Goals" WHERE "companyId" = $1 AND "isSample" = true AND "deletedAt" IS NULL`,
            [owner.company.id]
        );
        expect(Number(marked.rows[0]?.total)).toBe(2);
        const exported = await harness.call<ExportBody>(owner.token, 'GET', '/account/export');
        expect(exported.body.sections.goals).toEqual({ goals: [], goalHoldings: [] });

        await harness.call(owner.token, 'DELETE', '/onboarding/sample');

        expect((await harness.call<ListBody>(owner.token, 'GET', '/goals')).body.items).toEqual([]);
    });

    it('com objetivo real, o exemplo não é carregado e a limpeza só apaga exemplo', async () => {
        const owner: Account = await harness.signUp('sample-real');
        await create(owner, { name: 'Real' });

        await harness.call(owner.token, 'POST', '/onboarding/sample');
        await harness.call(owner.token, 'DELETE', '/onboarding/sample');

        expect((await harness.call<ListBody>(owner.token, 'GET', '/goals')).body.items.map((item) => item.name)).toEqual(['Real']);
    });

    it('saída de titular: o objetivo da pessoa passa para a Conta toda e a reserva dela vira objetivo comum se já há reserva da conta', async () => {
        const { owner, ana } = await team('departure');
        const hers = await create(owner, { name: 'Da Ana', holderUserId: ana.user.id });
        const herReserve = await create(owner, { kind: 'emergency_reserve', name: 'Reserva da Ana', holderUserId: ana.user.id });
        const wholeReserve = await create(owner, { kind: 'emergency_reserve', name: 'Reserva da conta' });
        expect([hers.status, herReserve.status, wholeReserve.status]).toEqual([201, 201, 201]);

        const removal = await harness.call(owner.token, 'DELETE', `/members/${ana.user.id}`);

        expect(removal.status).toBe(204);
        const list = await harness.call<ListBody & { items: (GoalBody & { kind: string })[] }>(owner.token, 'GET', '/goals');
        const byName = new Map(list.body.items.map((item) => [item.name, item]));
        expect(byName.get('Da Ana')?.holderUserId).toBeNull();
        expect(byName.get('Reserva da Ana')).toMatchObject({ holderUserId: null, kind: 'other' });
        expect(byName.get('Reserva da conta')).toMatchObject({ holderUserId: null, kind: 'emergency_reserve' });
    });
});
