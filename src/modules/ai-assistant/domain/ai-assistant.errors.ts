import { AppError } from '../../../shared/errors/app.error';

export class AiConsentRequiredError extends AppError {
    public constructor() {
        super({
            code: 'ai.consent_required',
            status: 403,
            detail: 'The account did not allow aggregated figures to be sent to a language model.'
        });
    }
}

export class AiNoticeOutdatedError extends AppError {
    public constructor(currentVersion: number) {
        super({
            code: 'ai.notice_outdated',
            status: 409,
            detail: 'The notice the person accepted is not the current one.',
            meta: { currentVersion }
        });
    }
}
