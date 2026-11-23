export abstract class RecurringRefreshPort {
    public abstract refresh(companyId: string): Promise<void>;
}
