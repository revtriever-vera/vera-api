export const LOOKUP_MAX_RESULTS: number = 3;

export interface LookupQuote {
    readonly price: string;
    readonly currency: string;
    readonly date: string;
    readonly stale: boolean;
}

export interface LookupEntry {
    readonly externalId: string;
    readonly symbol: string;
    readonly name: string;
    readonly market: string;
    readonly kind: string;
    readonly typeGroup: string;
    readonly suggestedClassKey: string | null;
    readonly currency: string;
    readonly quote: LookupQuote | null;
}
