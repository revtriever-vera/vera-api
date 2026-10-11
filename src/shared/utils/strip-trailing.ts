export function stripTrailing(value: string, char: string, limit: number = Number.POSITIVE_INFINITY): string {
    let end: number = value.length;
    let removed: number = 0;
    while (end > 0 && removed < limit && value[end - 1] === char) {
        end -= 1;
        removed += 1;
    }
    return value.slice(0, end);
}
