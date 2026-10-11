import { AppError } from '../../../shared/errors/app.error';

export class InvalidSummaryMonthError extends AppError {
    public constructor(month: string) {
        super({
            code: 'summary.invalid_month',
            status: 422,
            detail: 'The month must be in the format YYYY-MM, from 2000-01 to the current month.',
            meta: { month }
        });
    }
}

export class DeclaredIncomeRequiredError extends AppError {
    public constructor() {
        super({
            code: 'summary.declared_income_required',
            status: 422,
            detail: 'The declared income mode requires a declared income greater than zero.'
        });
    }
}
