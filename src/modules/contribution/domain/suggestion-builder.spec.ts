import { describe, expect, it } from 'vitest';
import { PortfolioSourceData, snapshotOf, SourceAssignment, SourceClass } from '../../../../test/support/contribution-fixtures';
import { classIdOf, makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { ContributionTargetsNotSetError } from './contribution.errors';
import { AssetSuggestion, ClassSuggestion, ContributionSuggestion } from './contribution.types';
import { buildSuggestion } from './suggestion-builder';

const ACOES_BR_TARGETS: Readonly<Record<string, number>> = { ITUB4: 3000, WEGE3: 4000, PETR4: 3000 };

function prototype(overrides: Partial<PortfolioSourceData> = {}): PortfolioSourceData {
    const base: PortfolioSourceData = makePrototypeSource();
    const assignments: SourceAssignment[] = base.assignments.map((assignment: SourceAssignment): SourceAssignment => ({
        ...assignment,
        targetInClassBps: ACOES_BR_TARGETS[assignment.subjectId.replace('position-', '')] ?? 0
    }));
    return { ...base, assignments, ...overrides };
}

function suggest(source: PortfolioSourceData, amount: number): ContributionSuggestion {
    return buildSuggestion(snapshotOf(source), amount);
}

function classOf(result: ContributionSuggestion, key: string): ClassSuggestion | undefined {
    return result.classes.find((item: ClassSuggestion): boolean => item.classId === classIdOf(key));
}

function withClassTargets(targets: Readonly<Record<string, number>>): SourceClass[] {
    return makePrototypeSource().classes.map((item: SourceClass): SourceClass => ({
        ...item,
        targetBps: targets[item.systemKey ?? ''] ?? 0
    }));
}

describe('buildSuggestion', () => {
    it('reproduces the prototype contribution of R$ 10.000,00 on the class layer', () => {
        const result = suggest(prototype(), 1_000_000);

        expect(result.classes.map((item) => [item.classId, item.amountMinor])).toEqual(
            [
                [classIdOf('rf_ipca'), 394_046],
                [classIdOf('acoes_br'), 219_325],
                [classIdOf('acoes_eua'), 347_596],
                [classIdOf('fii'), 39_033]
            ].toSorted((left, right) => (right[1] as number) - (left[1] as number))
        );
        expect(result).toMatchObject({ baseCurrency: 'BRL', totalBeforeMinor: 177_310_040, totalAfterMinor: 178_310_040, warnings: [] });
        expect(result.classes.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(1_000_000);
    });

    it('reports the share after the contribution by class', () => {
        const result = suggest(prototype(), 1_000_000);

        const after: Record<string, number> = Object.fromEntries(result.classes.map((item) => [item.systemKey, item.shareAfterBps]));
        expect(after).toEqual({ rf_ipca: 746, acoes_br: 1247, fii: 655, acoes_eua: 2099 });
        expect(classOf(result, 'acoes_br')).toMatchObject({ valueBeforeMinor: 22_017_000, targetBps: 1500, note: null });
    });

    it('distributes inside the class by the effective target and fills the units', () => {
        const result = suggest(prototype(), 1_000_000);

        const assets: readonly AssetSuggestion[] = classOf(result, 'acoes_br')?.assets ?? [];
        expect(assets.map((asset) => [asset.symbol, asset.amountMinor])).toEqual([
            ['WEGE3', 213_607],
            ['PETR4', 5_718]
        ]);
        expect(assets[0]).toMatchObject({
            kind: 'position',
            typeGroup: 'acoes_br',
            unitPrice: '52.10',
            priceCurrency: 'BRL',
            approxUnits: '40'
        });
        expect(assets[1]?.approxUnits).toBe('1');
        expect(assets[0]?.targetInClassBps).toBe(4000);
        expect(assets.reduce((sum, asset) => sum + asset.amountMinor, 0)).toBe(219_325);
    });

    it('shows the share inside the class before and after', () => {
        const result = suggest(prototype(), 1_000_000);

        const wege: AssetSuggestion | undefined = classOf(result, 'acoes_br')?.assets[0];
        expect(wege?.shareInClassBeforeBps).toBe(Math.round((7_815_000 * 10000) / 22_017_000));
        expect(wege?.shareInClassAfterBps).toBe(Math.round(((7_815_000 + 213_607) * 10000) / (22_017_000 + 219_325)));
    });

    it('gives fixed income no units and keeps the amounts of the class adding up', () => {
        const result = suggest(prototype({ classes: withClassTargets({ rf_pos: 10_000 }) }), 30_000_000);

        const titles: readonly AssetSuggestion[] = classOf(result, 'rf_pos')?.assets ?? [];
        expect(titles.length).toBeGreaterThan(0);
        expect(titles.every((asset) => (asset.kind === 'position' ? true : asset.approxUnits === null && asset.unitPrice === null))).toBe(
            true
        );
        expect(titles.some((asset) => asset.kind === 'fixed_income')).toBe(true);
        expect(titles.reduce((sum, asset) => sum + asset.amountMinor, 0)).toBe(30_000_000);
    });

    it('converts to the dollar for the units of a US asset', () => {
        const result = suggest(prototype({ classes: withClassTargets({ acoes_eua: 10_000 }) }), 50_000_000);

        const voo: AssetSuggestion | undefined = classOf(result, 'acoes_eua')?.assets.find((asset) => asset.symbol === 'VOO');
        expect(voo?.priceCurrency).toBe('USD');
        expect(voo?.approxUnits).toBe(String(Math.floor((voo?.amountMinor ?? 0) / 100 / 5.42 / 545)));
    });

    it('does not suggest a matured title but keeps its value in the class', () => {
        const source: PortfolioSourceData = prototype();
        const result = suggest(
            {
                ...source,
                titles: source.titles.map((title) => (title.name === 'Treasury 2027' ? { ...title, matured: true } : title))
            },
            1_000_000
        );

        const symbols: string[] = result.classes.flatMap((item) => item.assets.map((asset) => asset.symbol));
        expect(symbols).not.toContain('Treasury 2027');
        expect(result.totalBeforeMinor).toBe(177_310_040);
    });

    it('flags a funded class without a holding as no_assets', () => {
        const source: PortfolioSourceData = prototype();
        const classes: SourceClass[] = withClassTargets({ cripto: 5000, acoes_br: 5000 });
        const result = suggest(
            {
                ...source,
                classes,
                positions: source.positions.filter((position) => !['BTC', 'ETH'].some((symbol) => position.id.endsWith(symbol)))
            },
            100_000
        );

        expect(classOf(result, 'cripto')).toMatchObject({ assets: [], note: 'no_assets' });
        expect(result.warnings).toEqual([]);
    });

    it('funds a zero quantity position from its price', () => {
        const source: PortfolioSourceData = prototype();
        const result = suggest(
            {
                ...source,
                classes: withClassTargets({ acoes_br: 10_000 }),
                positions: source.positions.map((position) =>
                    position.id === 'position-PETR4' ? { ...position, quantity: '0' } : position
                )
            },
            100_000
        );

        const petr: AssetSuggestion | undefined = classOf(result, 'acoes_br')?.assets.find((asset) => asset.symbol === 'PETR4');
        expect(petr?.amountMinor).toBeGreaterThan(0);
        expect(petr?.approxUnits).toBe(String(Math.floor((petr?.amountMinor ?? 0) / 3690)));
    });

    it('leaves the units null when the quote is missing', () => {
        const source: PortfolioSourceData = prototype();
        const result = suggest(
            {
                ...source,
                classes: withClassTargets({ acoes_br: 10_000 }),
                quotes: source.quotes.filter((quote) => quote.assetId !== 'asset-PETR4')
            },
            100_000
        );

        const petr: AssetSuggestion | undefined = classOf(result, 'acoes_br')?.assets.find((asset) => asset.symbol === 'PETR4');
        expect(petr).toMatchObject({ approxUnits: null, unitPrice: null });
    });

    it('refuses when every class target is zero', () => {
        const source: PortfolioSourceData = prototype();

        expect(() => suggest({ ...source, classes: withClassTargets({}) }, 100_000)).toThrow(ContributionTargetsNotSetError);
    });

    it('warns when the class targets do not add up to 100%', () => {
        const source: PortfolioSourceData = prototype();

        const result = suggest({ ...source, classes: withClassTargets({ acoes_br: 3000, fii: 3000 }) }, 100_000);

        expect(result.warnings).toEqual(['class_targets_not_100']);
        expect(result.classes.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(100_000);
    });

    it('follows the targets exactly on an empty portfolio', () => {
        const result = suggest({ ...makePrototypeSource(), positions: [], titles: [], assignments: [] }, 1_000_000);

        const byKey: Record<string, number> = Object.fromEntries(result.classes.map((item) => [item.systemKey, item.amountMinor]));
        expect(byKey).toEqual({
            rf_pos: 200_000,
            rf_pre: 80_000,
            rf_ipca: 120_000,
            acoes_br: 150_000,
            fii: 70_000,
            acoes_eua: 250_000,
            reits: 80_000,
            cripto: 50_000
        });
        expect(result.totalBeforeMinor).toBe(0);
        expect(result.classes.every((item) => item.note === 'no_assets')).toBe(true);
    });

    it('keeps the sum in a dollar base', () => {
        const result = suggest(prototype({ baseCurrency: 'USD' }), 123_457);

        expect(result.baseCurrency).toBe('USD');
        expect(result.classes.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(123_457);
        result.classes.forEach((item) => {
            if (item.assets.length > 0) {
                expect(item.assets.reduce((sum, asset) => sum + asset.amountMinor, 0)).toBe(item.amountMinor);
            }
        });
    });
});
