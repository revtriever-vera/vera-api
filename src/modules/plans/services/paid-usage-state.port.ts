import { PaidUsageSnapshot } from '../domain/plans.types';

export abstract class PaidUsageStatePort {
    public abstract state(): Promise<PaidUsageSnapshot>;
}
