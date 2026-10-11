import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { Page } from '../../../../shared/pagination/pagination.types';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { ImportCommitApplication } from '../../application/import-commit.application';
import { ImportListApplication } from '../../application/import-list.application';
import { ImportPreviewApplication } from '../../application/import-preview.application';
import { FileRequiredError } from '../../domain/statement-import.errors';
import {
    IMPORTS_PER_HOUR,
    ImportCommitView,
    ImportPreview,
    ImportSummary,
    ONE_HOUR_SECONDS,
    PREVIEWS_PER_HOUR,
    UploadedStatement
} from '../../domain/statement-import.types';
import {
    CommitBodyDto,
    commitBodySchema,
    importCommitSchema,
    ImportIdParamsDto,
    importListQuerySchema,
    importListSchema,
    ImportListQueryDto,
    importPreviewSchema,
    importRemovedSchema,
    multipartBodyOf,
    PreviewBodyDto,
    previewBodySchema
} from '../../validation/statement-import.schemas';
import { StatementUploadInterceptor } from './statement-upload.interceptor';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid fields, missing file or invalid mapping (zod validation details in meta.errors)';
const TOO_LARGE: string = 'The file is larger than 5 MB (imports.file_too_large)';
const IMPORT_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Import id' };

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
const TOO_LARGE_EXAMPLE: Record<string, unknown> = { type: 'imports.file_too_large', title: 'FileTooLargeError', status: 413 };
const THROTTLED_EXAMPLE: Record<string, unknown> = { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 };
const NOT_FOUND_EXAMPLE: Record<string, unknown> = { type: 'imports.import_not_found', title: 'ImportNotFoundError', status: 404 };

const REJECTION_EXAMPLE: Record<string, unknown> = { line: 14, reason: 'invalid_amount' };

const PREVIEW_EXAMPLE: Record<string, unknown> = {
    detectedFormat: 'ofx',
    format: 'ofx',
    fileName: 'vera-qa-nubank-cartao.ofx',
    rows: 6,
    rejected: 0,
    rejections: [],
    periodStart: '2026-09-09',
    periodEnd: '2026-10-01',
    currency: 'BRL',
    sample: [{ date: '2026-09-09', description: 'UBER *TRIP', amountMinor: -3250 }],
    columns: null,
    accountHint: { institution: 'Nubank', numberLast4: '4321' },
    suggestedAccountId: '0199c3a0-2222-7c52-9d0e-3f6a1b2c4d5e',
    alreadyImportedAt: null
};

const IMPORT_EXAMPLE: Record<string, unknown> = {
    id: '0199c3a0-5555-7c52-9d0e-3f6a1b2c4d5e',
    accountId: '0199c3a0-2222-7c52-9d0e-3f6a1b2c4d5e',
    accountName: 'Nubank Cartão',
    format: 'ofx',
    fileName: 'vera-qa-nubank-cartao.ofx',
    rows: 6,
    inserted: 4,
    duplicates: 2,
    rejected: 0,
    periodStart: '2026-09-09',
    periodEnd: '2026-10-01',
    status: 'completed',
    createdAt: '2026-10-12T10:00:00.000Z'
};

function companyOf(subject: RateLimitSubject): string | null {
    return subject.companyId ?? null;
}

function requireFile(file: UploadedStatement | undefined): UploadedStatement {
    if (file === undefined) {
        throw new FileRequiredError();
    }
    return file;
}

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/imports')
export class ImportsController {
    public constructor(
        private readonly previews: ImportPreviewApplication,
        private readonly commits: ImportCommitApplication,
        private readonly list: ImportListApplication
    ) {}

    @Post('preview')
    @HttpCode(HttpStatus.OK)
    @RateLimit({ key: 'statement-preview', limit: PREVIEWS_PER_HOUR, windowSeconds: ONE_HOUR_SECONDS, identify: companyOf })
    @UseInterceptors(StatementUploadInterceptor)
    @ApiOperation({
        summary: 'Preview a bank statement without saving anything',
        description:
            'Detects the format (OFX 1.x or 2.x, Nubank card or account CSV, or a generic CSV), reads the file and returns the period, ' +
            'a sample, the rows it could not read and the account of the company that matches the file. Nothing is stored: the file is ' +
            'read in memory and discarded, and the confirmed import sends the same file again. A generic CSV sent without `mapping` ' +
            'returns only `columns` and the number of data lines, so the client can ask for the mapping.'
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: multipartBodyOf(previewBodySchema) })
    @ApiZodResponse({
        status: 200,
        description: 'What the file holds and what would happen',
        schema: importPreviewSchema,
        example: PREVIEW_EXAMPLE
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 413, description: TOO_LARGE, example: TOO_LARGE_EXAMPLE })
    @ApiProblemResponse({
        status: 422,
        description:
            'Not a statement (imports.unsupported_format), no valid rows or broken structure (imports.invalid_file, meta.reason), ' +
            'more than 10,000 rows (imports.too_many_rows)',
        example: { type: 'imports.unsupported_format', title: 'UnsupportedFormatError', status: 422 }
    })
    @ApiProblemResponse({ status: 429, description: 'More than 60 previews in an hour for the company', example: THROTTLED_EXAMPLE })
    public async preview(@UploadedFile() file: UploadedStatement | undefined, @Body() body: PreviewBodyDto): Promise<ImportPreview> {
        return this.previews.preview(requireFile(file), body);
    }

    @Post()
    @RateLimit({ key: 'statement-import', limit: IMPORTS_PER_HOUR, windowSeconds: ONE_HOUR_SECONDS, identify: companyOf })
    @UseInterceptors(StatementUploadInterceptor)
    @ApiOperation({
        summary: 'Import a bank statement',
        description:
            'Saves the transactions of the file in an existing account (`accountId`) or in a new one (`newAccountName` and ' +
            '`newAccountKind`). The same transaction already saved from this file, from another file or from the bank connection ' +
            '(same account, same amount, one day apart) counts in `duplicates` and is not created again, so importing the same file ' +
            'twice adds nothing. The import is one batch that `DELETE /spending/imports/{id}` undoes; if it fails midway, nothing is kept.'
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: multipartBodyOf(commitBodySchema) })
    @ApiZodResponse({
        status: 201,
        description: 'The import with its counters and up to 20 examples of rejected rows',
        schema: importCommitSchema,
        example: { ...IMPORT_EXAMPLE, rejections: [REJECTION_EXAMPLE] }
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description: 'The account does not exist in this company (transactions.account_not_found)',
        example: { type: 'transactions.account_not_found', title: 'AccountNotFoundError', status: 404 }
    })
    @ApiProblemResponse({ status: 413, description: TOO_LARGE, example: TOO_LARGE_EXAMPLE })
    @ApiProblemResponse({
        status: 422,
        description:
            'Same errors as the preview, plus a generic CSV without mapping (imports.mapping_required), a file currency that differs ' +
            'from the account (imports.currency_mismatch) and the transaction limit (transactions.limit_reached)',
        example: { type: 'imports.currency_mismatch', title: 'CurrencyMismatchError', status: 422 }
    })
    @ApiProblemResponse({ status: 429, description: 'More than 20 imports in an hour for the company', example: THROTTLED_EXAMPLE })
    public async commit(@UploadedFile() file: UploadedStatement | undefined, @Body() body: CommitBodyDto): Promise<ImportCommitView> {
        return this.commits.commit(requireFile(file), body);
    }

    @Get()
    @ApiOperation({
        summary: 'List the imports of the company',
        description: 'Newest first. The sample rows and the file content are not part of the list.'
    })
    @ApiZodQuery(importListQuerySchema)
    @ApiZodResponse({
        status: 200,
        description: 'Page of imports',
        schema: importListSchema,
        example: { data: [IMPORT_EXAMPLE], pagination: { page: 1, pageSize: 50, totalRecords: 1, totalPages: 1 } }
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async listImports(@Query() query: ImportListQueryDto): Promise<Page<ImportSummary>> {
        return this.list.list(query.page, query.pageSize);
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Undo an import',
        description:
            'Removes the transactions this import created. A transaction that came from the bank connection stays: it only loses ' +
            'the link with the rows of the file it had absorbed. Undoing an import already undone removes nothing.'
    })
    @ApiParam(IMPORT_ID_PARAM)
    @ApiZodResponse({
        status: 200,
        description: 'How many transactions were removed',
        schema: importRemovedSchema,
        example: { removed: 4 }
    })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description: 'The import does not exist in this company (imports.import_not_found)',
        example: NOT_FOUND_EXAMPLE
    })
    public async undo(@Param() params: ImportIdParamsDto): Promise<{ removed: number }> {
        return this.list.undo(params.id);
    }
}
