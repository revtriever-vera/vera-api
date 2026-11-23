import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { DateUtil } from '../../src/shared/utils/date.util';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';
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
});
