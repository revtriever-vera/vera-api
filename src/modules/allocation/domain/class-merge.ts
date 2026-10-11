export interface MergeInput {
    readonly originClassBps: number;
    readonly destinationClassBps: number;
    readonly origin: ReadonlyMap<string, number>;
    readonly destination: ReadonlyMap<string, number>;
}

export function largestRemainder(weights: readonly number[], total: number): number[] {
    const sum: number = weights.reduce((acc: number, weight: number) => acc + weight, 0);
    if (sum === 0) {
        return weights.map((): number => 0);
    }
    const floors: number[] = weights.map((weight: number) => Math.floor((total * weight) / sum));
    const remainders: number[] = weights.map((weight: number) => (total * weight) % sum);
    const missing: number = total - floors.reduce((acc: number, floor: number) => acc + floor, 0);
    const winners: Set<number> = new Set<number>(
        remainders
            .map((remainder: number, index: number) => ({ remainder, index }))
            .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
            .slice(0, missing)
            .map((entry: { remainder: number; index: number }) => entry.index)
    );
    return floors.map((floor: number, index: number) => (winners.has(index) ? floor + 1 : floor));
}

function classWeights(input: MergeInput): readonly [number, number] {
    const combined: number = input.originClassBps + input.destinationClassBps;
    return combined === 0 ? [1, 1] : [input.originClassBps, input.destinationClassBps];
}

function unionOfKeys(input: MergeInput): string[] {
    return [...new Set<string>([...input.origin.keys(), ...input.destination.keys()])];
}

export function mergeInClassTargets(input: MergeInput): Map<string, number> {
    const [originWeight, destinationWeight]: readonly [number, number] = classWeights(input);
    const keys: string[] = unionOfKeys(input);
    const numerators: number[] = keys.map(
        (key: string) => originWeight * (input.origin.get(key) ?? 0) + destinationWeight * (input.destination.get(key) ?? 0)
    );
    const denominator: number = originWeight + destinationWeight;
    const total: number = Math.round(numerators.reduce((acc: number, value: number) => acc + value, 0) / denominator);
    const shares: number[] = largestRemainder(numerators, total);
    return new Map<string, number>(keys.map((key: string, index: number): [string, number] => [key, shares[index] ?? 0]));
}
