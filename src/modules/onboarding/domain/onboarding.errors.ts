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
