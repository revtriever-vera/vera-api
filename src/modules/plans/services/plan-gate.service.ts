import { Injectable } from '@nestjs/common';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { FeatureDisabledError, PremiumRequiredError } from '../domain/plans.errors';
import { DeploymentMode, EffectivePlan, FEATURE_STATES, FeatureState, PaidFeature, PaidUsageSnapshot } from '../domain/plans.types';
import { FeatureStateService } from './feature-state.service';
import { PaidUsageReader } from './paid-usage-reader.service';
import { PlanResolverService } from './plan-resolver.service';
import { PlansLogService } from './plans-log.service';
import { PlansMetricsService } from './plans-metrics.service';

@Injectable()
export class PlanGateService {
    public constructor(
        private readonly states: FeatureStateService,
        private readonly resolver: PlanResolverService,
        private readonly usage: PaidUsageReader,
        private readonly logs: PlansLogService,
        private readonly metrics: PlansMetricsService
    ) {}

    public async stateOf(feature: PaidFeature): Promise<FeatureState> {
        return this.states.of(feature);
    }

    public async allows(feature: PaidFeature): Promise<boolean> {
        return (await this.states.of(feature)) === FEATURE_STATES.available;
    }

    public async assert(feature: PaidFeature): Promise<void> {
        const state: FeatureState = await this.states.of(feature);
        if (state === FEATURE_STATES.available) {
            this.metrics.gate(feature, 'allowed');
            return;
        }
        this.metrics.gate(feature, 'denied');
        this.logs.gateDenied(feature, state);
        throw await this.errorFor(feature, state);
    }

    public async planOf(): Promise<EffectivePlan> {
        return this.resolver.planOf();
    }

    public mode(): DeploymentMode {
        return this.resolver.mode();
    }

    private async errorFor(feature: PaidFeature, state: FeatureState): Promise<Error> {
        if (state === FEATURE_STATES.disabled) {
            return new FeatureDisabledError(feature);
        }
        if (state === FEATURE_STATES.premiumRequired) {
            return new PremiumRequiredError(feature);
        }
        const usage: PaidUsageSnapshot | null = await this.usage.state();
        const plan: EffectivePlan = await this.resolver.planOf();
        return new CapReachedError(feature, usage?.resetsAt ?? null, plan === 'self_hosted' ? null : plan);
    }
}
