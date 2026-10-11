import { describe, expect, it } from 'vitest';
import { largestRemainder, mergeInClassTargets } from './class-merge';

function sum(values: Iterable<number>): number {
    return [...values].reduce((acc: number, value: number) => acc + value, 0);
}

describe('mergeInClassTargets', () => {
    it('recompõe pela média ponderada das metas de classe (origem 10% e destino 15%)', () => {
        const result: Map<string, number> = mergeInClassTargets({
            originClassBps: 1000,
            destinationClassBps: 1500,
            origin: new Map([
                ['A', 6000],
                ['B', 4000]
            ]),
            destination: new Map([
                ['B', 5000],
                ['C', 5000]
            ])
        });

        expect(result.get('A')).toBe(2400);
        expect(result.get('B')).toBe(4600);
        expect(result.get('C')).toBe(3000);
        expect(sum(result.values())).toBe(10000);
    });

    it('com as duas metas de classe em zero usa pesos iguais', () => {
        const result: Map<string, number> = mergeInClassTargets({
            originClassBps: 0,
            destinationClassBps: 0,
            origin: new Map([['A', 10000]]),
            destination: new Map([['B', 10000]])
        });

        expect(result.get('A')).toBe(5000);
        expect(result.get('B')).toBe(5000);
    });

    it('mantém a soma exata quando o arredondamento sobra (3333/3333/3334)', () => {
        const result: Map<string, number> = mergeInClassTargets({
            originClassBps: 3000,
            destinationClassBps: 4000,
            origin: new Map([
                ['A', 3333],
                ['B', 3333],
                ['C', 3334]
            ]),
            destination: new Map([
                ['D', 3333],
                ['E', 3333],
                ['F', 3334]
            ])
        });

        expect(sum(result.values())).toBe(10000);
        expect(result.size).toBe(6);
    });

    it('a soma é a soma ponderada arredondada quando um dos lados não tem ativos', () => {
        const result: Map<string, number> = mergeInClassTargets({
            originClassBps: 1000,
            destinationClassBps: 2000,
            origin: new Map([
                ['A', 3333],
                ['B', 3333],
                ['C', 3334]
            ]),
            destination: new Map()
        });

        expect(sum(result.values())).toBe(3333);
    });

    it('ativo só na origem e ativo só no destino entram com o peso da própria classe', () => {
        const result: Map<string, number> = mergeInClassTargets({
            originClassBps: 2000,
            destinationClassBps: 6000,
            origin: new Map([['A', 10000]]),
            destination: new Map([['B', 10000]])
        });

        expect(result.get('A')).toBe(2500);
        expect(result.get('B')).toBe(7500);
    });

    it('sem ativos devolve mapa vazio e sem metas devolve zeros', () => {
        expect(mergeInClassTargets({ originClassBps: 100, destinationClassBps: 100, origin: new Map(), destination: new Map() }).size).toBe(
            0
        );
        const zeros: Map<string, number> = mergeInClassTargets({
            originClassBps: 100,
            destinationClassBps: 100,
            origin: new Map([['A', 0]]),
            destination: new Map()
        });
        expect(zeros.get('A')).toBe(0);
    });
});

describe('largestRemainder', () => {
    it('distribui o total por maiores restos e preserva a soma', () => {
        expect(largestRemainder([1, 1, 1], 10000)).toEqual([3334, 3333, 3333]);
        expect(sum(largestRemainder([5, 3, 2, 7], 9999))).toBe(9999);
    });

    it('desempata pelo menor índice', () => {
        expect(largestRemainder([1, 1], 3)).toEqual([2, 1]);
    });

    it('pesos zerados devolvem zeros', () => {
        expect(largestRemainder([0, 0], 100)).toEqual([0, 0]);
    });
});
