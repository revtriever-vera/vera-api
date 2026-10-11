import { CLASS_COLOR_KEYS, ClassColorKey } from './allocation.types';

export function nextColorKey(used: readonly string[]): ClassColorKey {
    const usage: Map<string, number> = new Map<string, number>();
    for (const colorKey of used) {
        usage.set(colorKey, (usage.get(colorKey) ?? 0) + 1);
    }
    const lowest: number = Math.min(...CLASS_COLOR_KEYS.map((colorKey: ClassColorKey) => usage.get(colorKey) ?? 0));
    return CLASS_COLOR_KEYS.find((colorKey: ClassColorKey) => (usage.get(colorKey) ?? 0) === lowest) ?? CLASS_COLOR_KEYS[0];
}
