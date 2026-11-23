import { describe, expect, it, vi } from 'vitest';
import { makeTitle } from '../../../../test/support/fixed-income-fixtures';
import { FixedIncomeValuationService, ValuedTitle } from '../../fixed-income/services/fixed-income-valuation.service';
import { ScheduleSourceService, ScheduleTreasury } from '../../fixed-income-schedule/services/schedule-source.service';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { IssuersLogService } from '../../issuers/services/issuers-log.service';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { FgcCoverage, FgcHolderBlock } from '../domain/fgc.types';
import { FgcCoverageService } from './fgc-coverage.service';

const ANA: string = '0199a000-0000-7000-8000-000000000001';

function only(coverage: FgcCoverage): FgcHolderBlock {
    expect(coverage.blocks).toHaveLength(1);
    return coverage.blocks[0] as FgcHolderBlock;
}

function valued(
    id: string,
    issuerId: string | null,
    valueMinor: number,
    extra: { status?: string; matured?: boolean; kind?: string; currency?: string; holderUserId?: string | null } = {}
): ValuedTitle {
    return {
        title: makeTitle({
            id,
            issuerId,
            name: `CDB ${id}`,
            kind: (extra.kind ?? 'cdb') as 'cdb',
            currency: (extra.currency ?? 'BRL') as 'BRL',
            holderUserId: extra.holderUserId ?? null
        }),
        valuation: {
            valueMinor,
            matured: extra.matured ?? false,
            estimated: false,
            status: extra.status ?? 'ok'
        } as ValuedTitle['valuation']
    };
}

function treasury(overrides: Partial<ScheduleTreasury> = {}): ScheduleTreasury {
    return {
        id: 'tes-1',
        name: 'Tesouro Selic',
        kind: 'selic',
        quantity: '1',
        maturityDate: '2099-01-01',
        valueTodayMinor: 500,
        isSample: false,
        holderUserId: null,
        ...overrides
    };
}

function build(titles: ValuedTitle[], treasuries: ScheduleTreasury[] = []): FgcCoverageService {
    const directory: IssuerDirectoryService = new IssuerDirectoryService({
        loaded: vi.fn(),
        failed: vi.fn()
    } as unknown as IssuersLogService);
    directory.onModuleInit();
    return new FgcCoverageService(
        { valueAll: vi.fn().mockResolvedValue(titles) } as unknown as FixedIncomeValuationService,
        { loadTreasuries: vi.fn().mockResolvedValue(treasuries) } as unknown as ScheduleSourceService,
        directory
    );
}

describe('FgcCoverageService', () => {
    it('groups Pan and BTG Pactual together and leaves the rest outside with the reason', async () => {
        const service: FgcCoverageService = build(
            [
                valued('a', 'banco-pan', 20_000_000),
                valued('b', 'btg-pactual', 10_000_000),
                valued('c', null, 100),
                valued('d', 'petrobras', 200, { kind: 'debenture' }),
                valued('e', 'banco-inter', 300, { matured: true }),
                valued('f', 'banco-inter', 400, { currency: 'USD' })
            ],
            [treasury()]
        );

        const coverage: FgcHolderBlock = only(await service.coverage(ANY_HOLDER));

        expect(coverage.coveredMinor).toBe(25_000_000);
        expect(coverage.groups).toHaveLength(1);
        expect(coverage.groups[0]).toMatchObject({ groupId: 'btg-pactual', totalMinor: 30_000_000, overMinor: 5_000_000 });
        expect(coverage.outside.map((entry) => [entry.id, entry.reason])).toEqual([
            ['c', 'missing_issuer'],
            ['d', 'not_covered_kind'],
            ['f', 'foreign'],
            ['tes-1', 'tesouro']
        ]);
    });

    it('shows the example titles like the real ones: Daycoval and Itaú covered, the debenture outside', async () => {
        const coverage: FgcHolderBlock = only(
            await build([
                valued('s0', 'banco-daycoval', 2_500_000),
                valued('s1', 'itau-unibanco', 1_800_000, { kind: 'lci' }),
                valued('s2', 'eletrobras', 3_000_000, { kind: 'debenture' })
            ]).coverage(ANY_HOLDER)
        );

        expect(coverage.groups.map((group) => [group.groupId, group.totalMinor, group.overMinor])).toEqual([
            ['daycoval', 2_500_000, 0],
            ['itau-unibanco', 1_800_000, 0]
        ]);
        expect(coverage.outside.map((entry) => entry.reason)).toEqual(['not_covered_kind']);
    });

    it('treats the "Outro emissor" option as not calculated, not as a pending registration', async () => {
        const service: FgcCoverageService = build([valued('a', 'outro', 100), valued('b', 'outro', 5, { kind: 'debenture' })]);

        expect(only(await service.coverage(ANY_HOLDER)).outside.map((entry) => entry.reason)).toEqual(['not_calculated', 'not_calculated']);
        expect(await service.simulate({ issuerId: 'outro', kind: 'lca', valueMinor: 9 })).toMatchObject({ verdict: 'not_calculated' });
    });

    it('flags a title valued without the index series as estimated', async () => {
        const coverage: FgcHolderBlock = only(
            await build([valued('a', 'banco-inter', 100, { status: 'index_data_missing' })]).coverage(ANY_HOLDER)
        );

        expect(coverage.groups[0]?.titles[0]?.estimated).toBe(true);
    });

    it('ignores a matured Tesouro position and values a position without a quote as zero', async () => {
        const coverage: FgcHolderBlock = only(
            await build([], [treasury({ maturityDate: '2000-01-01' }), treasury({ id: 'tes-2', valueTodayMinor: null })]).coverage(
                ANY_HOLDER
            )
        );

        expect(coverage.outside).toEqual([{ id: 'tes-2', name: 'Tesouro Selic', reason: 'tesouro', valueMinor: 0 }]);
    });

    it('computes one block per holder, each with its own limit, and "Conta toda" apart', async () => {
        const coverage: FgcCoverage = await build([
            valued('a', 'banco-pan', 20_000_000, { holderUserId: ANA }),
            valued('b', 'btg-pactual', 20_000_000),
            valued('c', 'banco-pan', 10_000_000, { holderUserId: ANA })
        ]).coverage(ANY_HOLDER);

        const byHolder: Record<string, FgcHolderBlock> = Object.fromEntries(
            coverage.blocks.map((block: FgcHolderBlock): [string, FgcHolderBlock] => [String(block.holderUserId), block])
        );
        expect(coverage.blocks).toHaveLength(2);
        expect(byHolder[ANA]).toMatchObject({ coveredMinor: 25_000_000 });
        expect(byHolder[ANA]?.groups[0]).toMatchObject({ totalMinor: 30_000_000, overMinor: 5_000_000 });
        expect(byHolder['null']).toMatchObject({ coveredMinor: 20_000_000 });
    });

    it('passes the filter to the valuation and to the treasuries', async () => {
        const valueAll = vi.fn().mockResolvedValue([]);
        const loadTreasuries = vi.fn().mockResolvedValue([]);
        const directory: IssuerDirectoryService = new IssuerDirectoryService({
            loaded: vi.fn(),
            failed: vi.fn()
        } as unknown as IssuersLogService);
        const service: FgcCoverageService = new FgcCoverageService(
            { valueAll } as unknown as FixedIncomeValuationService,
            { loadTreasuries } as unknown as ScheduleSourceService,
            directory
        );

        const coverage: FgcCoverage = await service.coverage({ kind: 'person', userId: ANA });

        expect(valueAll).toHaveBeenCalledWith(expect.any(Date), { kind: 'person', userId: ANA });
        expect(loadTreasuries).toHaveBeenCalledWith({ kind: 'person', userId: ANA });
        expect(coverage.blocks).toEqual([]);
    });

    it('simulates against the group without counting the edited title', async () => {
        const service: FgcCoverageService = build([valued('a', 'banco-pan', 20_000_000)]);

        expect(await service.simulate({ issuerId: 'btg-pactual', kind: 'cdb', valueMinor: 6_000_000 })).toMatchObject({
            verdict: 'over_limit',
            overMinor: 1_000_000
        });
        expect(await service.simulate({ issuerId: 'btg-pactual', kind: 'cdb', valueMinor: 6_000_000, excludeTitleId: 'a' })).toMatchObject({
            verdict: 'covered',
            totalAfterMinor: 6_000_000
        });
    });

    it('rejects an unknown issuer and an issuer that does not fit the kind', async () => {
        const service: FgcCoverageService = build([]);

        await expect(service.simulate({ issuerId: 'nao-existe', kind: 'cdb', valueMinor: 1 })).rejects.toMatchObject({
            code: 'fixed_income.unknown_issuer'
        });
        await expect(service.simulate({ issuerId: 'petrobras', kind: 'cdb', valueMinor: 1 })).rejects.toMatchObject({
            code: 'fixed_income.issuer_kind_mismatch'
        });
    });
});
