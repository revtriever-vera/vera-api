import { AiMarkerKind, LabelSource } from './ai-context.types';

export interface KeyedItem {
    readonly kind: AiMarkerKind;
    readonly systemKey: string | null;
    readonly realName: string;
    readonly defaultLabel: string | null;
}

export interface AssignedKey {
    readonly chave: string;
    readonly rotulo_padrao?: string;
}

export function markerKeyOf(kind: AiMarkerKind, chave: string): string {
    return `${kind}:${chave}`;
}

export class ContextKeys {
    private readonly sources: Map<string, LabelSource> = new Map<string, LabelSource>();
    private readonly customCounts: Map<AiMarkerKind, number> = new Map<AiMarkerKind, number>();

    public assign(item: KeyedItem): AssignedKey {
        const chave: string = item.systemKey ?? this.nextCustom(item.kind);
        this.sources.set(markerKeyOf(item.kind, chave), { kind: item.kind, name: item.realName });
        if (item.systemKey === null || item.defaultLabel === null) {
            return { chave };
        }
        return { chave, rotulo_padrao: item.defaultLabel };
    }

    public all(): ReadonlyMap<string, LabelSource> {
        return this.sources;
    }

    private nextCustom(kind: AiMarkerKind): string {
        const next: number = (this.customCounts.get(kind) ?? 0) + 1;
        this.customCounts.set(kind, next);
        return `custom_${String(next)}`;
    }
}
