export const EXAMPLE_IDS: Readonly<Record<'preview' | 'import' | 'asset', string>> = {
    preview: '0199c3a0-1111-7c52-9d0e-3f6a1b2c4d5e',
    import: '0199c3a0-5555-7c52-9d0e-3f6a1b2c4d5e',
    asset: '0199c3a0-7777-7c52-9d0e-3f6a1b2c4d5e'
};

export const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
export const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
export const THROTTLED_EXAMPLE: Record<string, unknown> = { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 };

export const PROBLEM_EXAMPLES: Readonly<Record<string, Record<string, unknown>>> = {
    forbidden: { type: 'identity.insufficient_role', title: 'InsufficientRoleError', status: 403 },
    tooLarge: { type: 'file.too_large', title: 'FileTooLargeError', status: 413, meta: { limitBytes: 10485760 } },
    notRecognized: {
        type: 'format.not_recognized',
        title: 'FormatNotRecognizedError',
        status: 422,
        meta: { suggestion: 'b3_excel_download' }
    },
    modelConfirmation: {
        type: 'model.confirmation_required',
        title: 'ModelConfirmationRequiredError',
        status: 428,
        meta: { sentTo: 'language_model', provider: 'vercel' }
    },
    modelUnavailable: { type: 'model.unavailable', title: 'ModelUnavailableError', status: 503 },
    modelUnreadable: { type: 'model.unreadable', title: 'ModelUnreadableError', status: 422, meta: { reason: 'invalid_response' } },
    tooManyPages: { type: 'file.too_many_pages', title: 'FileTooManyPagesError', status: 422, meta: { limit: 50 } },
    expired: { type: 'preview.expired', title: 'PreviewExpiredError', status: 410 },
    blocked: { type: 'import.has_blocked_lines', title: 'BlockedLinesError', status: 422, meta: { lineIds: ['L3'], total: 1 } },
    undoBlocked: {
        type: 'import.undo_blocked',
        title: 'ImportUndoBlockedError',
        status: 409,
        meta: { reason: 'later_import', laterImportId: EXAMPLE_IDS.import, laterImportDate: '2026-10-20' }
    }
};

const BALANCE_BEFORE: Record<string, unknown> = { quantity: '100', averagePrice: '30.5' };
const BALANCE_AFTER: Record<string, unknown> = { quantity: '150', averagePrice: '32.1' };

const EFFECT_EXAMPLE: Record<string, unknown> = {
    assetId: EXAMPLE_IDS.asset,
    ticker: 'ITUB4',
    name: 'Itaú Unibanco',
    existingPosition: true,
    before: BALANCE_BEFORE,
    after: BALANCE_AFTER
};

export const PREVIEW_EXAMPLE: Record<string, unknown> = {
    previewId: EXAMPLE_IDS.preview,
    source: 'b3',
    documentType: 'b3_report',
    notes: [{ code: 'rows_ignored', count: 1 }],
    operations: [
        {
            lineId: 'L1',
            status: 'check',
            reason: 'position_mode_required',
            kind: 'buy',
            incomeKind: null,
            direction: 'credit',
            tradeDate: '2026-09-09',
            ticker: 'ITUB4',
            assetId: EXAMPLE_IDS.asset,
            quantity: '50',
            unitPrice: '35.2',
            grossMinor: 176000,
            feesMinor: 0,
            currency: 'BRL',
            positionMode: null
        }
    ],
    effect: [EFFECT_EXAMPLE],
    fixedIncome: [
        {
            lineId: 'F1',
            product: 'CDB - CDB EXEMPLO 112% CDI',
            issuerName: 'BANCO EXEMPLO',
            issuerId: null,
            issuer: null,
            kind: 'cdb',
            indexer: 'cdi_percent',
            rateBps: 11200,
            appliedMinor: 1000000,
            appliedAt: '2024-03-15',
            maturityDate: '2028-03-15',
            status: 'inferred',
            reason: null,
            suggestion: 'Achamos: CDB BANCO EXEMPLO, 112% do CDI, vence em 03/2028. Confirmar?'
        }
    ],
    warnings: [{ code: 'position_mode_required', count: 1 }],
    alreadyImportedAt: null,
    expiresAt: '2026-10-12T10:30:00.000Z'
};

export const COMMIT_EXAMPLE: Record<string, unknown> = {
    importId: EXAMPLE_IDS.import,
    applied: 1,
    skipped: 0,
    positions: [EFFECT_EXAMPLE],
    fixedIncome: [{ lineId: 'F1', titleId: '0198a2f4-7c11-7d3a-9e55-4b1f6a2c8d90' }]
};

export const IMPORT_RECORD_EXAMPLE: Record<string, unknown> = {
    id: EXAMPLE_IDS.import,
    source: 'b3',
    fileName: 'negociacao-2026.xlsx',
    status: 'completed',
    operations: 1,
    fixedIncomeTitles: 0,
    createdAt: '2026-10-12T10:00:00.000Z'
};
