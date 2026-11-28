import { AppError } from '../../../shared/errors/app.error';

export class UnknownOnboardingStepError extends AppError {
    public constructor(step: string) {
        super({
            code: 'onboarding.unknown_step',
            status: 400,
            detail: 'The given step is not one of the onboarding steps.',
            meta: { step }
        });
    }
}

export class OnboardingAlreadyClosedError extends AppError {
    public constructor() {
        super({
            code: 'onboarding.already_closed',
            status: 409,
            detail: 'The onboarding was already finished or dismissed and cannot change anymore.'
        });
    }
}

export class OnboardingActionOutOfStepError extends AppError {
    public constructor(action: string, step: string, status: string) {
        super({
            code: 'onboarding.action_out_of_step',
            status: 409,
            detail: 'The onboarding conversation is not at a point where this action can be taken.',
            meta: { action, step, status }
        });
    }
}

export class SampleUnavailableError extends AppError {
    public constructor() {
        super({
            code: 'onboarding.sample_unavailable',
            status: 409,
            detail: 'No module registered sample data, so there is nothing to load.'
        });
    }
}

export class SampleFailedError extends AppError {
    public constructor(area: string) {
        super({
            code: 'onboarding.sample_failed',
            status: 500,
            detail: 'A module failed while handling its sample data and everything was rolled back.',
            meta: { area }
        });
    }
}
