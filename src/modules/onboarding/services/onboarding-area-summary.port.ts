export type OnboardingArea = 'assets' | 'banks' | 'target';

export interface OnboardingAreaSummary {
    readonly items: number;
    readonly amountCents: number | null;
    readonly currency: string | null;
    readonly breakdown?: Readonly<Record<string, number>>;
}

export abstract class OnboardingAreaSummaryPort {
    public abstract readonly area: OnboardingArea;
    public abstract summarize(companyId: string): Promise<OnboardingAreaSummary>;
}
