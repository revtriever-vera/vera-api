import { AppError } from '../../../shared/errors/app.error';

export class PortfolioClassNotFoundError extends AppError {
    public constructor(classId: string) {
        super({
            code: 'allocation.class_not_found',
            status: 404,
            detail: 'The asset class does not exist.',
            meta: { classId }
        });
    }
}
