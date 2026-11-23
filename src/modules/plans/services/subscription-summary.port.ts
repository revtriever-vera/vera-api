import { SubscriptionSnapshot } from '../domain/plans.types';

export abstract class SubscriptionSummaryPort {
    public abstract summary(): Promise<SubscriptionSnapshot | null>;
}
