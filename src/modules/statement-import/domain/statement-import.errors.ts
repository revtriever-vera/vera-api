import { AppError } from '../../../shared/errors/app.error';
import { InvalidFileReason } from './statement-import.types';

export class FileRequiredError extends AppError {
    public constructor() {
        super({ code: 'imports.file_required', status: 400, detail: 'The multipart field `file` is required.' });
    }
}

export class FileTooLargeError extends AppError {
    public constructor(limitBytes: number) {
        super({
            code: 'imports.file_too_large',
            status: 413,
            detail: 'The statement file exceeds the size limit.',
            meta: { limitBytes }
        });
    }
}

export class UnsupportedFormatError extends AppError {
    public constructor() {
        super({
            code: 'imports.unsupported_format',
            status: 422,
            detail: 'The file is not an OFX statement nor a CSV file.'
        });
    }
}

export class InvalidFileError extends AppError {
    public constructor(reason: InvalidFileReason) {
        super({
            code: 'imports.invalid_file',
            status: 422,
            detail: 'The file has no valid rows or its structure is broken.',
            meta: { reason }
        });
    }
}

export class TooManyRowsError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'imports.too_many_rows',
            status: 422,
            detail: 'The file has more rows than the import limit.',
            meta: { limit }
        });
    }
}

export class MappingRequiredError extends AppError {
    public constructor() {
        super({
            code: 'imports.mapping_required',
            status: 422,
            detail: 'A generic CSV needs the column mapping.'
        });
    }
}

export class CurrencyMismatchError extends AppError {
    public constructor(fileCurrency: string, accountCurrency: string) {
        super({
            code: 'imports.currency_mismatch',
            status: 422,
            detail: 'The currency of the file differs from the currency of the account.',
            meta: { fileCurrency, accountCurrency }
        });
    }
}
