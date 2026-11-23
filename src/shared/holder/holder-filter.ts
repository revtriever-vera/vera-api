import { z } from 'zod';

export const HOLDER_FILTER_KINDS = {
    any: 'any',
    all: 'all',
    person: 'person'
} as const;

export type HolderFilterKind = (typeof HOLDER_FILTER_KINDS)[keyof typeof HOLDER_FILTER_KINDS];

export type HolderFilter =
    | { readonly kind: 'any' }
    | { readonly kind: 'all' }
    | { readonly kind: 'person'; readonly userId: string };

export const ANY_HOLDER: HolderFilter = { kind: HOLDER_FILTER_KINDS.any };

export const holderQuerySchema = z
    .union([z.enum([HOLDER_FILTER_KINDS.any, HOLDER_FILTER_KINDS.all]), z.string().uuid()])
    .default(HOLDER_FILTER_KINDS.any)
    .describe(
        'Holder filter: `any` (default) is everything, `all` is only what belongs to the whole account ("Conta toda"), ' +
            'or the id of a person to see only what is theirs'
    );

export function holderFilterOf(value: string): HolderFilter {
    if (value === HOLDER_FILTER_KINDS.any) {
        return ANY_HOLDER;
    }
    if (value === HOLDER_FILTER_KINDS.all) {
        return { kind: HOLDER_FILTER_KINDS.all };
    }
    return { kind: HOLDER_FILTER_KINDS.person, userId: value };
}

export function holderWhereOf(filter: HolderFilter): { holderUserId?: string | null } {
    if (filter.kind === HOLDER_FILTER_KINDS.any) {
        return {};
    }
    return { holderUserId: filter.kind === HOLDER_FILTER_KINDS.all ? null : filter.userId };
}

export function matchesHolder(filter: HolderFilter, holderUserId: string | null): boolean {
    if (filter.kind === HOLDER_FILTER_KINDS.any) {
        return true;
    }
    return filter.kind === HOLDER_FILTER_KINDS.all ? holderUserId === null : holderUserId === filter.userId;
}
