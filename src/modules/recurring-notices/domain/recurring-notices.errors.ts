import { AppError } from '../../../shared/errors/app.error';

export class NoticeSeriesNotFoundError extends AppError {
    public constructor(seriesId: string) {
        super({
            code: 'recurring_notices.series_not_found',
            status: 404,
            detail: 'The recurring series does not exist or is not confirmed.',
            meta: { seriesId }
        });
    }
}
