export function chunkOf<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let start: number = 0; start < items.length; start += size) {
        chunks.push(items.slice(start, start + size));
    }
    return chunks;
}
