interface Share {
    readonly index: number;
    readonly base: bigint;
    readonly remainder: bigint;
}

function compareRemainders(left: Share, right: Share): number {
    if (left.remainder === right.remainder) {
        return left.index - right.index;
    }
    return left.remainder > right.remainder ? -1 : 1;
}

function sumOf(values: readonly bigint[]): bigint {
    return values.reduce((sum: bigint, value: bigint): bigint => sum + value, 0n);
}

function weightsOf(volumesMinor: readonly number[]): bigint[] {
    const volumes: bigint[] = volumesMinor.map(BigInt);
    return sumOf(volumes) === 0n ? volumes.map((): bigint => 1n) : volumes;
}

export function allocateFees(totalFeesMinor: number, volumesMinor: readonly number[]): number[] {
    const weights: bigint[] = weightsOf(volumesMinor);
    const weightSum: bigint = sumOf(weights);
    const total: bigint = BigInt(totalFeesMinor);
    const shares: Share[] = weights.map((weight: bigint, index: number): Share => ({
        index,
        base: (total * weight) / weightSum,
        remainder: (total * weight) % weightSum
    }));
    const leftover: number = Number(total - sumOf(shares.map((share: Share): bigint => share.base)));
    const winners: ReadonlySet<number> = new Set(
        shares
            .toSorted(compareRemainders)
            .slice(0, leftover)
            .map((share: Share): number => share.index)
    );
    return shares.map((share: Share): number => Number(share.base) + (winners.has(share.index) ? 1 : 0));
}
