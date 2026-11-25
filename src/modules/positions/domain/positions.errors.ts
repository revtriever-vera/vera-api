import { AppError } from '../../../shared/errors/app.error';

export class AssetAlreadyInPortfolioError extends AppError {
    public constructor(positionId: string) {
        super({
            code: 'positions.asset_already_in_portfolio',
            status: 409,
            detail: 'The asset is already in the portfolio. Edit the existing position instead.',
            meta: { positionId }
        });
    }
}

export class PositionNotFoundError extends AppError {
    public constructor(positionId: string) {
        super({
            code: 'positions.position_not_found',
            status: 404,
            detail: 'The position does not exist.',
            meta: { positionId }
        });
    }
}

export class InvalidQuantityError extends AppError {
    public constructor(allowedDecimals: number) {
        super({
            code: 'positions.invalid_quantity',
            status: 422,
            detail: 'The quantity has more decimal places than the asset allows.',
            meta: { allowedDecimals }
        });
    }
}

export class ClassRequiredError extends AppError {
    public constructor(assetId: string) {
        super({
            code: 'positions.class_required',
            status: 422,
            detail: 'The asset has no suggested class: choose the class of the position.',
            meta: { assetId }
        });
    }
}

export class PositionLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'positions.limit_reached',
            status: 422,
            detail: 'The company reached the maximum number of positions.',
            meta: { limit }
        });
    }
}

export class AssetNotAvailableError extends AppError {
    public constructor(assetId: string) {
        super({
            code: 'positions.asset_not_available',
            status: 422,
            detail: 'The asset is no longer listed and cannot be added to the portfolio.',
            meta: { assetId }
        });
    }
}

export class SellExceedsPositionError extends AppError {
    public constructor(assetId: string, lineNumber: number, tradeDate: string) {
        super({
            code: 'positions.sell_exceeds_position',
            status: 422,
            detail: 'The sale is larger than the position held on that date.',
            meta: { assetId, lineNumber, tradeDate }
        });
    }
}

export class InvalidOperationError extends AppError {
    public constructor(lineNumber: number, reason: string) {
        super({
            code: 'positions.invalid_operation',
            status: 422,
            detail: 'The operation is not valid.',
            meta: { lineNumber, reason }
        });
    }
}

export class ImportNotFoundError extends AppError {
    public constructor(importId: string) {
        super({
            code: 'positions.import_not_found',
            status: 404,
            detail: 'The import does not exist.',
            meta: { importId }
        });
    }
}

export class ImportNotOpenError extends AppError {
    public constructor(importId: string) {
        super({
            code: 'positions.import_not_open',
            status: 409,
            detail: 'The import was already applied or undone.',
            meta: { importId }
        });
    }
}

export class UndoBlockedByLaterImportError extends AppError {
    public constructor(laterImportId: string, laterImportDate: string) {
        super({
            code: 'positions.undo_blocked_by_later_import',
            status: 409,
            detail: 'A later import touches the same assets: undo it first.',
            meta: { laterImportId, laterImportDate }
        });
    }
}

export class PositionChangedSinceImportError extends AppError {
    public constructor(assetId: string) {
        super({
            code: 'positions.changed_since_import',
            status: 409,
            detail: 'The position was edited after the import, so the import cannot be undone safely.',
            meta: { assetId }
        });
    }
}
