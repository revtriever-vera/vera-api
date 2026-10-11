import { AppError } from '../../../shared/errors/app.error';

export class ContributionTargetsNotSetError extends AppError {
    public constructor() {
        super({
            code: 'contribution.targets_not_set',
            status: 422,
            detail: 'The class targets are all zero, so there is nothing to approach with a contribution.'
        });
    }
}
