import { describe, expect, it } from 'vitest';
import { allocateCuts } from './cut-allocator';
import { CutAllocation, CutCandidate, CutPlan } from './spending-cuts.types';

function candidate(key: string, spentMinor: number, averageMinor: number | null): CutCandidate {
    return { key, tieKey: key, spentMinor, averageMinor };
}

const CANONICAL: readonly CutCandidate[] = [
    candidate('groceries', 290_000, 265_000),
    candidate('eating_out', 245_000, 175_000),
    candidate('shopping', 235_000, 160_000),
    candidate('leisure', 190_000, 140_000),
    candidate('transport', 130_000, 120_000),
    candidate('subscriptions', 64_000, 61_000)
];

function cutsOf(plan: CutPlan): Record<string, number> {
    return Object.fromEntries(plan.allocations.map((item: CutAllocation): [string, number] => [item.key, item.cutMinor]));
}

function sumOf(plan: CutPlan): number {
    return plan.allocations.reduce((sum: number, item: CutAllocation): number => sum + item.cutMinor, 0);
}

describe('allocateCuts', () => {
    it('meta de 20%: o excesso cobre o gap e os centavos vão para os maiores restos', () => {
        const plan: CutPlan = allocateCuts(224_000, CANONICAL);

        expect(cutsOf(plan)).toEqual({
            shopping: 72_103,
            eating_out: 67_296,
            leisure: 48_069,
            groceries: 24_034,
            transport: 9_614,
            subscriptions: 2_884
        });
        expect(plan.totalCutMinor).toBe(224_000);
        expect(plan.excessTotalMinor).toBe(233_000);
        expect(sumOf(plan)).toBe(224_000);
    });

    it('meta de 35%: o gap passa do excesso e o resto é proporcional ao gasto', () => {
        const plan: CutPlan = allocateCuts(644_000, CANONICAL);

        expect(cutsOf(plan)).toEqual({
            shopping: 158_696,
            eating_out: 157_257,
            groceries: 128_284,
            leisure: 117_669,
            transport: 56_300,
            subscriptions: 25_794
        });
        expect(sumOf(plan)).toBe(644_000);
    });

    it('meta de 60%: cada categoria é cortada até o próprio gasto', () => {
        const plan: CutPlan = allocateCuts(1_344_000, CANONICAL);

        expect(plan.allocations.map((item: CutAllocation): number => item.cutMinor)).toEqual(
            CANONICAL.map((item: CutCandidate): number => item.spentMinor)
        );
        expect(plan.totalCutMinor).toBe(1_154_000);
    });

    it('meta de 10%: sem gap, nenhum corte', () => {
        const plan: CutPlan = allocateCuts(0, CANONICAL);

        expect(plan.totalCutMinor).toBe(0);
        expect(sumOf(plan)).toBe(0);
        expect(plan.excessTotalMinor).toBe(233_000);
    });

    it('Pix para Lazer: Lazer passa a 270.000 e o corte total não muda', () => {
        const withPix: readonly CutCandidate[] = CANONICAL.map((item: CutCandidate): CutCandidate =>
            item.key === 'leisure' ? candidate('leisure', 270_000, 140_000) : item
        );

        const plan: CutPlan = allocateCuts(224_000, withPix);

        expect(cutsOf(plan)).toEqual({
            leisure: 93_035,
            shopping: 53_674,
            eating_out: 50_096,
            groceries: 17_891,
            transport: 7_157,
            subscriptions: 2_147
        });
        expect(sumOf(plan)).toBe(224_000);
    });

    it('média nula conta como excesso 0 e só recebe a parte proporcional', () => {
        const plan: CutPlan = allocateCuts(1_000, [candidate('new', 5_000, null), candidate('old', 5_000, 4_000)]);

        expect(plan.excessTotalMinor).toBe(1_000);
        expect(cutsOf(plan)).toEqual({ new: 0, old: 1_000 });
        const above: CutPlan = allocateCuts(3_000, [candidate('new', 5_000, null), candidate('old', 5_000, 4_000)]);
        expect(cutsOf(above)).toEqual({ new: 1_000, old: 2_000 });
    });

    it('sem candidatas devolve plano vazio mesmo com gap', () => {
        const plan: CutPlan = allocateCuts(5_000, []);

        expect(plan).toEqual({ totalCutMinor: 0, excessTotalMinor: 0, allocations: [] });
    });

    it('empate de resto desempata por maior gasto e depois pela chave', () => {
        const equal: CutPlan = allocateCuts(1, [candidate('b', 100, 100), candidate('a', 100, 100)]);
        const bigger: CutPlan = allocateCuts(1, [candidate('a', 100, 100), candidate('b', 200, 200)]);

        expect(cutsOf(equal)).toEqual({ a: 1, b: 0 });
        expect(cutsOf(bigger)).toEqual({ a: 0, b: 1 });
    });

    it('propriedade: soma exata, limites e independência de ordem', () => {
        let seed: number = 20_261_011;
        const next = (limit: number): number => {
            seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
            return seed % limit;
        };
        for (let round: number = 0; round < 300; round += 1) {
            const candidates: CutCandidate[] = Array.from({ length: 1 + next(8) }, (_, index: number): CutCandidate => {
                const spent: number = 1 + next(500_000);
                return candidate(`c${String(index)}`, spent, next(4) === 0 ? null : next(600_000));
            });
            const spentTotal: number = candidates.reduce((sum: number, item: CutCandidate): number => sum + item.spentMinor, 0);
            const gap: number = next(spentTotal + 200_000);

            const plan: CutPlan = allocateCuts(gap, candidates);
            const reversed: CutPlan = allocateCuts(gap, [...candidates].reverse());

            expect(sumOf(plan)).toBe(plan.totalCutMinor);
            expect(plan.totalCutMinor).toBeLessThanOrEqual(Math.min(gap, spentTotal));
            const spentByKey: Map<string, number> = new Map<string, number>(
                candidates.map((entry: CutCandidate): [string, number] => [entry.key, entry.spentMinor])
            );
            const withinBounds: boolean = plan.allocations.every(
                (item: CutAllocation): boolean => item.cutMinor >= 0 && item.cutMinor <= (spentByKey.get(item.key) ?? 0)
            );
            expect(withinBounds).toBe(true);
            expect(cutsOf(reversed)).toEqual(cutsOf(plan));
        }
    });
});
