export interface SampleAreaResult {
    readonly area: string;
    readonly count: number;
}

export abstract class SampleDataPort {
    public abstract readonly area: string;
    public abstract seed(companyId: string): Promise<number>;
    public abstract clear(companyId: string): Promise<number>;
}
