import { AppError } from '../../shared/errors/app.error';

export class MissingContextError extends AppError {
    public constructor() {
        super({
            code: 'core.missing_context',
            status: 500,
            detail: 'AppContext accessed outside of an AppContext.run scope.'
        });
    }
}
