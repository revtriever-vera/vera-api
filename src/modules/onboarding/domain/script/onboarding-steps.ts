import { OnboardingScript } from './onboarding-script';
import { ScriptStepDefinition } from './script.types';

export const ONBOARDING_STEPS: readonly ScriptStepDefinition[] = [];

export const ONBOARDING_SCRIPT: OnboardingScript = new OnboardingScript(ONBOARDING_STEPS);
