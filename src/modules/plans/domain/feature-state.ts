import { FEATURE_STATES, FeatureState } from './plans.types';

export interface FeatureStateInputs {
    readonly enabled: boolean;
    readonly hasCapability: boolean;
    readonly paused: boolean;
}

export function featureStateOf(inputs: FeatureStateInputs): FeatureState {
    if (!inputs.enabled) {
        return FEATURE_STATES.disabled;
    }
    if (!inputs.hasCapability) {
        return FEATURE_STATES.premiumRequired;
    }
    return inputs.paused ? FEATURE_STATES.paused : FEATURE_STATES.available;
}
