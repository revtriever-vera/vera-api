import { Injectable } from '@nestjs/common';
import { featureStateOf } from '../domain/feature-state';
import { FeatureState, PaidFeature, PaidUsageSnapshot } from '../domain/plans.types';
import { PaidFeatureAvailabilityRegistry } from './paid-feature-availability.registry';
import { PaidUsageReader } from './paid-usage-reader.service';
import { PlanResolverService } from './plan-resolver.service';

@Injectable()
export class FeatureStateService {
    public constructor(
        private readonly availability: PaidFeatureAvailabilityRegistry,
        private readonly resolver: PlanResolverService,
        private readonly usage: PaidUsageReader
    ) {}

    public async of(feature: PaidFeature): Promise<FeatureState> {
        const enabled: boolean = await this.availability.enabled(feature);
        const capabilities: PaidFeature[] = await this.resolver.capabilities();
        const usage: PaidUsageSnapshot | null = await this.usage.state();
        return featureStateOf({
            enabled,
            hasCapability: capabilities.includes(feature),
            paused: usage?.state === 'paused'
        });
    }
}
