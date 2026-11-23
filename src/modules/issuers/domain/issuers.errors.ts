import { AppError } from '../../../shared/errors/app.error';

export class IssuerDataInvalidError extends AppError {
    public constructor(reason: string, subject: string) {
        super({
            code: 'issuers.data_invalid',
            status: 500,
            detail: 'The curated issuer data is inconsistent.',
            meta: { reason, subject }
        });
    }
}
