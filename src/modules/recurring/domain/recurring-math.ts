export function median(values: readonly number[]): number {
    const sorted: number[] = [...values].sort((left: number, right: number): number => left - right);
    const middle: number = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[middle] ?? 0;
    }
    return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

export function mean(values: readonly number[]): number {
    return Math.round(values.reduce((sum: number, value: number): number => sum + value, 0) / values.length);
}

export function isWithinRatio(left: number, right: number, tolerance: number): boolean {
    return Math.abs(left - right) <= tolerance * Math.max(left, right);
}

export function mostFrequent(values: readonly string[]): string | null {
    const counts: Map<string, number> = new Map<string, number>();
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    let best: string | null = null;
    for (const [value, count] of counts) {
        const bestCount: number = best === null ? 0 : (counts.get(best) ?? 0);
        if (count > bestCount || (count === bestCount && best !== null && value < best)) {
            best = value;
        }
    }
    return best;
}

export function sortedUnique(values: readonly string[]): readonly string[] {
    return [...new Set<string>(values)].sort((left: string, right: string): number => left.localeCompare(right));
}
