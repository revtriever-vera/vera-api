import { AppError } from '../../../shared/errors/app.error';

export class ScheduleIndexDataMissingError extends AppError {
    public constructor() {
        super({
            code: 'fixed_income.index_data_missing',
            status: 503,
            detail: 'There is no IPCA series with twelve consecutive months yet, so the real rate cannot be computed.'
        });
    }
}
