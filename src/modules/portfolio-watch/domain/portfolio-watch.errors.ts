import { AppError } from '../../../shared/errors/app.error';

export class InvalidAgendaWindowError extends AppError {
    public constructor(from: string, to: string) {
        super({
            code: 'portfolio_watch.invalid_agenda_window',
            status: 400,
            detail: 'The window must start on or before its last day and span at most 366 days.',
            meta: { from, to }
        });
    }
}

export class FeatureLockedError extends AppError {
    public constructor(feature: string, documentCount: number) {
        super({
            code: 'plan.feature_locked',
            status: 402,
            detail: 'This feature is part of the Premium plan. Only the count of documents is available on this plan.',
            meta: { feature, documentCount }
        });
    }
}
