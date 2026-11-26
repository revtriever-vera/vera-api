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
