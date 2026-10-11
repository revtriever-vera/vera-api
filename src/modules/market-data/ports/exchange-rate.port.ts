export interface FetchedRate {
    readonly currency: string;
    readonly date: string;
    readonly brlPerUnit: string;
    readonly source: string;
}

export abstract class ExchangeRatePort {
    public abstract fetch(currency: string, date: Date): Promise<FetchedRate | null>;
}
