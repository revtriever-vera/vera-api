import { AppError } from '../../../shared/errors/app.error';

export class PlatformAccountNotFoundError extends AppError {
    public constructor() {
        super({
            code: 'platform.account_not_found',
            status: 404,
            detail: 'There is no customer account with this id.'
        });
    }
}
