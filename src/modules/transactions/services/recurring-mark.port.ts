export abstract class RecurringMarkPort {
    public abstract confirmedTransactionIds(transactionIds: readonly string[]): Promise<ReadonlySet<string>>;
}
