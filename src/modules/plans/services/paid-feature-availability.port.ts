import { PaidFeature } from '../domain/plans.types';

export abstract class PaidFeatureAvailabilityPort {
    public abstract readonly feature: PaidFeature;
    public abstract enabled(): Promise<boolean>;
}
