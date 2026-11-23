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

interface Holder {
    readonly userId: string;
    readonly name: string;
}

interface PositionBody {
    readonly id: string;
    readonly holderUserId: string | null;
}

interface TitleBody {
    readonly id: string;
    readonly holderUserId: string | null;
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { readonly positionId?: string };
}

interface HoldingsBody {
    readonly data: { readonly id: string; readonly symbol: string; readonly valueMinor: number; readonly holder: Holder | null }[];
}

interface OverviewBody {
    readonly totalMinor: number;
}

interface FgcBlock {
    readonly holder: Holder | null;
    readonly coveredMinor: number;
    readonly groups: { readonly totalMinor: number; readonly overMinor: number }[];
}

interface FgcBody {
    readonly scope: string;
    readonly peopleCount: number;
    readonly coveredMinor: number;
    readonly groups: { readonly totalMinor: number; readonly overMinor: number }[];
    readonly byHolder: FgcBlock[];
}

describe('holder of the asset', () => {
    let harness: AllocationHarness;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('holders', new CapturingPublisher());
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

    async function team(label: string): Promise<{ owner: Account; ana: Account; viewer: Account }> {
        const owner: Account = await harness.signUp(label);
        return { owner, ana: await asRole(harness, owner, 'editor'), viewer: await asRole(harness, owner, 'viewer') };
    }

    async function addPosition(
        account: Account,
        symbol: string,
        holderUserId?: string | null
    ): Promise<{ status: number; body: PositionBody & ProblemBody }> {
        return harness.call<PositionBody & ProblemBody>(account.token, 'POST', '/positions', {
            assetId: assetIds[symbol],
            quantity: '10',
            holderUserId
        });
    }

    async function addTitle(account: Account, appliedMinor: number, holderUserId: string | null): Promise<TitleBody> {
        const response = await harness.call<TitleBody>(account.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name: 'CDB',
            issuerId: 'banco-pan',
            indexer: 'prefixed',
            rateBps: 1200,
            appliedMinor,
            appliedAt: addDays(TODAY, -30),
            maturityDate: addDays(TODAY, 300),
            holderUserId
        });
        expect(response.status).toBe(201);
        return response.body;
    }

    async function holdings(account: Account, holder: string): Promise<HoldingsBody['data']> {
        const response = await harness.call<HoldingsBody>(account.token, 'GET', `/portfolio/holdings?holder=${holder}`);
        expect(response.status).toBe(200);
        return response.body.data;
    }

    async function totalOf(account: Account, holder: string): Promise<number> {
        return (await harness.call<OverviewBody>(account.token, 'GET', `/portfolio/overview?holder=${holder}`)).body.totalMinor;
    }

    it('the same asset coexists once per holder, sums in the overview and a repeat for the same holder points to the existing one', async () => {
        const { owner, ana } = await team('coexist');

        const mine = await addPosition(owner, 'PETR4', owner.user.id);
        const hers = await addPosition(owner, 'PETR4', ana.user.id);
        const whole = await addPosition(owner, 'PETR4');
        const repeat = await addPosition(owner, 'PETR4', ana.user.id);

        expect([mine.status, hers.status, whole.status]).toEqual([201, 201, 201]);
        expect([mine.body.holderUserId, hers.body.holderUserId, whole.body.holderUserId]).toEqual([owner.user.id, ana.user.id, null]);
        expect(repeat.status).toBe(409);
        expect(repeat.body.type).toBe('positions.asset_already_in_portfolio');
        expect(repeat.body.meta?.positionId).toBe(hers.body.id);
        expect(await holdings(owner, 'any')).toHaveLength(3);
        const each: number[] = [await totalOf(owner, owner.user.id), await totalOf(owner, ana.user.id), await totalOf(owner, 'all')];
        expect(each[0]).toBeGreaterThan(0);
        expect(new Set(each).size).toBe(1);
        expect(await totalOf(owner, 'any')).toBe(each[0]! * 3);
    });

    it('filters holdings and the overview by person or by the whole account, and names the holder', async () => {
        const { owner, ana } = await team('filter');
        const hers = await addPosition(owner, 'ITUB4', ana.user.id);
        await addPosition(owner, 'WEGE3');

        const forAna = await holdings(owner, ana.user.id);
        const forAll = await holdings(owner, 'all');

        expect(forAna.map((item) => item.id)).toEqual([hers.body.id]);
        expect(forAna[0]?.holder).toEqual({ userId: ana.user.id, name: 'Pessoa editor' });
        expect(forAll.map((item) => item.symbol)).toEqual(['WEGE3']);
        expect(forAll[0]?.holder).toBeNull();
        expect(await totalOf(owner, 'any')).toBe((await totalOf(owner, ana.user.id)) + (await totalOf(owner, 'all')));
        expect(await holdings(owner, owner.user.id)).toEqual([]);
    });

    it('refuses a holder that is not an active person of the account, even one from another company', async () => {
        const { owner } = await team('invalid');
        const stranger: Account = await harness.signUp('invalid-other');

        const outsider = await addPosition(owner, 'VOO', stranger.user.id);
        const unknown = await addPosition(owner, 'VOO', crypto.randomUUID());
        const title = await harness.call<ProblemBody>(owner.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name: 'CDB',
            indexer: 'prefixed',
            rateBps: 1200,
            appliedMinor: 100,
            appliedAt: addDays(TODAY, -30),
            maturityDate: addDays(TODAY, 300),
            holderUserId: stranger.user.id
        });

        expect([outsider.status, outsider.body.type]).toEqual([422, 'members.invalid_holder']);
        expect([unknown.status, unknown.body.type]).toEqual([422, 'members.invalid_holder']);
        expect([title.status, title.body.type]).toEqual([422, 'members.invalid_holder']);
        expect(await holdings(owner, 'any')).toEqual([]);
    });

    it('lets Editor and Owner set the holder and refuses Viewer', async () => {
        const { owner, ana, viewer } = await team('roles');

        const byEditor = await harness.call<PositionBody>(ana.token, 'POST', '/positions', {
            assetId: assetIds['VOO'],
            quantity: '1',
            holderUserId: owner.user.id
        });
        const byViewer = await harness.call<ProblemBody>(viewer.token, 'POST', '/positions', {
            assetId: assetIds['AAPL'],
            quantity: '1',
            holderUserId: owner.user.id
        });
        const moved = await harness.call<PositionBody>(owner.token, 'PATCH', `/positions/${byEditor.body.id}`, {
            holderUserId: ana.user.id
        });
        const movedByViewer = await harness.call<ProblemBody>(viewer.token, 'PATCH', `/positions/${byEditor.body.id}`, {
            holderUserId: null
        });

        expect(byEditor.status).toBe(201);
        expect(byViewer.status).toBe(403);
        expect([moved.status, moved.body.holderUserId]).toEqual([200, ana.user.id]);
        expect(movedByViewer.status).toBe(403);
    });

    it('moving a position onto a holder that already has the asset points to the existing position', async () => {
        const { owner, ana } = await team('move');
        const hers = await addPosition(owner, 'IVVB11', ana.user.id);
        const whole = await addPosition(owner, 'IVVB11');

        const moved = await harness.call<ProblemBody>(owner.token, 'PATCH', `/positions/${whole.body.id}`, { holderUserId: ana.user.id });

        expect(moved.status).toBe(409);
        expect(moved.body.meta?.positionId).toBe(hers.body.id);
    });

    it('removing a person moves their positions and titles to the whole account', async () => {
        const { owner, ana } = await team('departure');
        const position = await addPosition(owner, 'KNRI11', ana.user.id);
        const title: TitleBody = await addTitle(owner, 1_000_000, ana.user.id);

        const removal = await harness.call(owner.token, 'DELETE', `/members/${ana.user.id}`);

        expect(removal.status).toBe(204);
        const positionRow = await harness.pg.query<{ holderUserId: string | null }>(
            `SELECT "holderUserId" FROM "Positions" WHERE "id" = $1`,
            [position.body.id]
        );
        const titleRow = await harness.pg.query<{ holderUserId: string | null }>(
            `SELECT "holderUserId" FROM "FixedIncomeTitles" WHERE "id" = $1`,
            [title.id]
        );
        expect([positionRow.rows[0]?.holderUserId, titleRow.rows[0]?.holderUserId]).toEqual([null, null]);
        expect((await holdings(owner, 'all')).map((item) => item.id)).toEqual(expect.arrayContaining([position.body.id, title.id]));
    });

    it('removing a person whose asset the whole account already has folds the positions into one, keeping the total', async () => {
        const { owner, ana } = await team('departure-twin');
        const whole = await addPosition(owner, 'PETR4');
        const hers = await addPosition(owner, 'PETR4', ana.user.id);
        const mine = await addPosition(owner, 'WEGE3', ana.user.id);
        const before: number = await totalOf(owner, 'any');

        const removal = await harness.call(owner.token, 'DELETE', `/members/${ana.user.id}`);

        expect(removal.status).toBe(204);
        const rows = await harness.pg.query<{ id: string; quantity: string; holderUserId: string | null; deletedAt: Date | null }>(
            `SELECT "id","quantity","holderUserId","deletedAt" FROM "Positions" WHERE "companyId" = $1 ORDER BY "createdAt"`,
            [owner.company.id]
        );
        const byId = new Map(rows.rows.map((row) => [row.id, row]));
        expect(Number(byId.get(whole.body.id)?.quantity)).toBe(20);
        expect(byId.get(whole.body.id)?.holderUserId).toBeNull();
        expect(byId.get(hers.body.id)?.deletedAt).not.toBeNull();
        expect(byId.get(mine.body.id)).toMatchObject({ holderUserId: null, deletedAt: null });
        expect((await holdings(owner, 'any')).map((item) => item.id).toSorted()).toEqual([whole.body.id, mine.body.id].toSorted());
        expect(await totalOf(owner, 'any')).toBe(before);
        const assignments = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM "AssetClassAssignments" WHERE "subjectId" = $1 AND "deletedAt" IS NULL`,
            [hers.body.id]
        );
        expect(Number(assignments.rows[0]?.total)).toBe(0);
    });

    it('computes the FGC per holder: the limit is per person, with "Conta toda" apart', async () => {
        const { owner, ana } = await team('fgc');
        await addTitle(owner, 20_000_000, ana.user.id);
        await addTitle(owner, 20_000_000, ana.user.id);
        await addTitle(owner, 20_000_000, owner.user.id);
        await addTitle(owner, 5_000_000, null);

        const everyone = await harness.call<FgcBody>(owner.token, 'GET', '/portfolio/fgc');
        const justAna = await harness.call<FgcBody>(owner.token, 'GET', `/portfolio/fgc?holder=${ana.user.id}`);
        const whole = await harness.call<FgcBody>(owner.token, 'GET', '/portfolio/fgc?holder=all');

        expect(everyone.status).toBe(200);
        expect(everyone.body).toMatchObject({ scope: 'account', peopleCount: 3, groups: [] });
        expect(everyone.body.byHolder.map((block) => block.holder?.userId ?? null)).toEqual([null, owner.user.id, ana.user.id]);
        const [wholeBlock, ownerBlock, anaBlock]: FgcBlock[] = everyone.body.byHolder as [FgcBlock, FgcBlock, FgcBlock];
        expect(anaBlock.coveredMinor).toBe(25_000_000);
        expect(anaBlock.groups[0]?.overMinor).toBeGreaterThan(15_000_000);
        expect(ownerBlock.groups[0]?.overMinor).toBe(0);
        expect(wholeBlock.groups[0]?.overMinor).toBe(0);
        expect(everyone.body.coveredMinor).toBe(wholeBlock.coveredMinor + ownerBlock.coveredMinor + anaBlock.coveredMinor);
        expect(justAna.body).toMatchObject({ scope: 'holder', coveredMinor: 25_000_000, byHolder: [] });
        expect(justAna.body.groups).toHaveLength(1);
        expect(whole.body).toMatchObject({ scope: 'holder', byHolder: [] });
        expect(whole.body.groups[0]?.totalMinor).toBeGreaterThanOrEqual(5_000_000);
        expect(whole.body.groups[0]?.totalMinor).toBeLessThan(6_000_000);
    });

    it('rejects a holder that is neither any, all nor an id', async () => {
        const { owner } = await team('bad-holder');

        const fgc = await harness.call<ProblemBody>(owner.token, 'GET', '/portfolio/fgc?holder=somebody');
        const overview = await harness.call<ProblemBody>(owner.token, 'GET', '/portfolio/overview?holder=somebody');

        expect([fgc.status, fgc.body.type]).toEqual([400, 'validation_failed']);
        expect(overview.status).toBe(400);
    });

    it('keeps the companies apart: the same filter in another company sees nothing of this one', async () => {
        const { owner, ana } = await team('isolated');
        await addPosition(owner, 'AAPL', ana.user.id);
        const other: Account = await harness.signUp('isolated-other');

        expect(await holdings(other, 'any')).toEqual([]);
        expect(await holdings(other, ana.user.id)).toEqual([]);
        expect(await totalOf(other, 'any')).toBe(0);
    });

    it('adds the Titular column to the export with the name, or "Conta toda"', async () => {
        const { owner, ana } = await team('export');
        await addPosition(owner, 'VOO', ana.user.id);
        await addPosition(owner, 'WEGE3');

        const response = await harness.callRaw(owner.token, '/portfolio/export?format=csv');

        const lines: string[] = response.bytes
            .toString('utf8')
            .split('\r\n')
            .filter((line: string) => line.length > 0);
        expect(lines[0]).toMatch(/;Titular$/);
        expect(
            lines
                .slice(1)
                .map((line: string) => line.split(';').at(-1))
                .toSorted()
        ).toEqual(['Conta toda', 'Pessoa editor']);
    });
});
