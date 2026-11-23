import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const TODAY: string = DateUtil.todayInBrazil();
process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

interface CoverageBody {
    readonly currency: string;
    readonly scope: string;
    readonly peopleCount: number;
    readonly coveredMinor: number;
    readonly groups: {
        readonly groupId: string;
        readonly totalMinor: number;
        readonly overMinor: number;
        readonly titles: { readonly id: string }[];
    }[];
    readonly outside: { readonly id: string; readonly reason: string }[];
}

interface SimulationBody {
    readonly verdict: string;
    readonly groupId: string;
    readonly totalAfterMinor: number;
    readonly overMinor: number;
}

describe('fixed income coverage (FGC)', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('fixed_income_coverage', new CapturingPublisher());
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function createTitle(account: Account, overrides: Record<string, unknown>): Promise<string> {
        const response = await harness.call<{ id: string }>(account.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name: 'CDB',
            indexer: 'prefixed',
            rateBps: 1200,
            appliedMinor: 10_000_000,
            appliedAt: addDays(TODAY, -30),
            maturityDate: addDays(TODAY, 300),
            ...overrides
        });
        expect(response.status).toBe(201);
        return response.body.id;
    }

    async function coverage(account: Account): Promise<CoverageBody> {
        const response = await harness.call<CoverageBody>(account.token, 'GET', '/portfolio/fgc');
        expect(response.status).toBe(200);
        return response.body;
    }

    async function simulate(account: Account, body: Record<string, unknown>): Promise<SimulationBody> {
        const response = await harness.call<SimulationBody>(account.token, 'POST', '/portfolio/fgc/simulate', body);
        expect(response.status).toBe(200);
        return response.body;
    }

    it('groups Pan and BTG Pactual, keeps the debenture outside and ignores the other company', async () => {
        const account: Account = await harness.signUp('fgc-a');
        const other: Account = await harness.signUp('fgc-b');
        await createTitle(account, { issuerId: 'banco-pan', appliedMinor: 20_000_000 });
        await createTitle(account, { issuerId: 'btg-pactual', appliedMinor: 10_000_000, kind: 'lci', name: 'LCI' });
        const free: string = await createTitle(account, { issuerId: 'outro', name: 'Livre', appliedMinor: 100 });
        const debenture: string = await createTitle(account, { issuerId: 'petrobras', kind: 'debenture', name: 'Deb', appliedMinor: 500 });
        await createTitle(other, { issuerId: 'banco-inter', appliedMinor: 77_000_000 });

        const body: CoverageBody = await coverage(account);

        expect(body).toMatchObject({ currency: 'BRL', scope: 'account', peopleCount: 1 });
        expect(body.groups).toHaveLength(1);
        expect(body.groups[0]?.groupId).toBe('btg-pactual');
        expect(body.groups[0]?.totalMinor).toBeGreaterThanOrEqual(30_000_000);
        expect(body.groups[0]?.overMinor).toBeGreaterThanOrEqual(5_000_000);
        expect(body.outside).toEqual(
            expect.arrayContaining([
                { id: debenture, name: 'Deb', reason: 'not_covered_kind', valueMinor: expect.any(Number) },
                { id: free, name: 'Livre', reason: 'not_calculated', valueMinor: expect.any(Number) }
            ])
        );
    });

    it('shows the example securities like the real ones', async () => {
        const account: Account = await harness.signUp('fgc-sample');
        await harness.call(account.token, 'POST', '/onboarding/sample');

        const response = await harness.call<CoverageBody>(account.token, 'GET', '/portfolio/fgc');

        expect(response.status).toBe(200);
        expect(response.body.groups.length).toBeGreaterThanOrEqual(1);
    });

    it('answers the four verdicts and does not count the edited title twice', async () => {
        const account: Account = await harness.signUp('fgc-sim');
        const title: string = await createTitle(account, { issuerId: 'banco-pan', appliedMinor: 20_000_000 });

        expect(await simulate(account, { issuerId: 'banco-inter', kind: 'cdb', valueMinor: 1_000 })).toMatchObject({ verdict: 'covered' });
        expect(await simulate(account, { issuerId: 'btg-pactual', kind: 'cdb', valueMinor: 6_000_000 })).toMatchObject({
            verdict: 'over_limit'
        });
        expect(
            await simulate(account, { issuerId: 'btg-pactual', kind: 'cdb', valueMinor: 6_000_000, excludeTitleId: title })
        ).toMatchObject({
            verdict: 'covered',
            totalAfterMinor: 6_000_000
        });
        expect(await simulate(account, { issuerId: 'petrobras', kind: 'debenture', valueMinor: 1 })).toMatchObject({
            verdict: 'not_covered_kind'
        });
        expect(await simulate(account, { issuerId: 'outro', kind: 'cdb', valueMinor: 1 })).toMatchObject({ verdict: 'not_calculated' });
    });

    it('rejects an unknown issuer, a kind mismatch, extra fields and a holder', async () => {
        const account: Account = await harness.signUp('fgc-errors');

        const unknown = await harness.call<{ type: string }>(account.token, 'POST', '/portfolio/fgc/simulate', {
            issuerId: 'nao-existe',
            kind: 'cdb',
            valueMinor: 1
        });
        const mismatch = await harness.call<{ type: string }>(account.token, 'POST', '/portfolio/fgc/simulate', {
            issuerId: 'petrobras',
            kind: 'cdb',
            valueMinor: 1
        });
        const extra = await harness.call<{ type: string }>(account.token, 'POST', '/portfolio/fgc/simulate', {
            issuerId: 'banco-pan',
            kind: 'cdb',
            valueMinor: 1,
            x: 1
        });
        const holder = await harness.call<{ type: string }>(account.token, 'GET', '/portfolio/fgc?holderId=abc');
        const anonymous = await harness.call<{ type: string }>(null, 'GET', '/portfolio/fgc');

        expect([unknown.status, unknown.body.type]).toEqual([422, 'fixed_income.unknown_issuer']);
        expect([mismatch.status, mismatch.body.type]).toEqual([422, 'fixed_income.issuer_kind_mismatch']);
        expect(extra.status).toBe(400);
        expect([holder.status, holder.body.type]).toEqual([400, 'fgc.holder_not_supported']);
        expect(anonymous.status).toBe(401);
    });
});
