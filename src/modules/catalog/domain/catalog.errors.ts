import { AppError } from '../../../shared/errors/app.error';
import { SOURCE_ERROR_CODES, SourceErrorCode } from './catalog.types';

const RETRYABLE: ReadonlySet<SourceErrorCode> = new Set<SourceErrorCode>([
    SOURCE_ERROR_CODES.unreachable,
    SOURCE_ERROR_CODES.rateLimited,
    SOURCE_ERROR_CODES.unavailable
]);

export class AssetNotFoundError extends AppError {
    public constructor(assetId: string) {
        super({
            code: 'catalog.asset_not_found',
            status: 404,
            detail: 'The asset does not exist in the catalog.',
            meta: { assetId }
        });
    }
}

export class CatalogSourceError extends Error {
    public readonly errorCode: SourceErrorCode;

    public constructor(errorCode: SourceErrorCode) {
        super(errorCode);
        this.name = 'CatalogSourceError';
        this.errorCode = errorCode;
    }

    public get retryable(): boolean {
        return RETRYABLE.has(this.errorCode);
    }
}
