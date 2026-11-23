import { AppError } from '../../../shared/errors/app.error';

export class FgcHolderNotSupportedError extends AppError {
    public constructor() {
        super({
            code: 'fgc.holder_not_supported',
            status: 400,
            detail: 'Holders are not available yet: the coverage is computed for the whole account.'
        });
    }
}

export class FgcUnknownIssuerError extends AppError {
    public constructor(issuerId: string) {
        super({
            code: 'fixed_income.unknown_issuer',
            status: 422,
            detail: 'The issuer is not in the curated list of institutions.',
            meta: { issuerId }
        });
    }
}

export class FgcIssuerKindMismatchError extends AppError {
    public constructor(titleKind: string, issuerKind: string) {
        super({
            code: 'fixed_income.issuer_kind_mismatch',
            status: 422,
            detail: 'The kind of the issuer does not fit the kind of the security.',
            meta: { titleKind, issuerKind }
        });
    }
}
