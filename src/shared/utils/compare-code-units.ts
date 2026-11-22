export function compareCodeUnits(left: string, right: string): number {
    if (left < right) {
        return -1;
    }
    return left > right ? 1 : 0;
}

export function maxCodeUnits(left: string, right: string): string {
    return compareCodeUnits(left, right) >= 0 ? left : right;
}

export function minCodeUnits(left: string, right: string): string {
    return compareCodeUnits(left, right) <= 0 ? left : right;
}
