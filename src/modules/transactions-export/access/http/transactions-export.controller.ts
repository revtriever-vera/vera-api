import { Controller, Get, Header, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { ExportFile } from '../../../../shared/spreadsheet/spreadsheet.types';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { TransactionsExportApplication } from '../../application/transactions-export.application';
import { TransactionsExportQueryDto, transactionsExportBaseSchema } from '../../validation/transactions-export.schemas';

const EXPORTS_PER_MINUTE: number = 10;
const ONE_MINUTE_SECONDS: number = 60;
const XLSX_TYPE: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_TYPE: string = 'text/csv';
const FILE_SCHEMA: Readonly<Record<string, string>> = { type: 'string', format: 'binary' };

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/transactions')
export class TransactionsExportController {
    public constructor(private readonly exports: TransactionsExportApplication) {}

    @Get('export')
    @Header('Cache-Control', 'no-store')
    @RateLimit({
        key: 'transactions-export',
        limit: EXPORTS_PER_MINUTE,
        windowSeconds: ONE_MINUTE_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Download the transactions as a spreadsheet',
        description:
            'One row per transaction of the filter, oldest first: date, description, payee, signed amount (negative is money out), ' +
            'currency, category, where the category comes from, account, institution and source. The filters are the ones of the ' +
            'list; without a date filter the current month is exported. Headers, default category names and the csv separators ' +
            'follow the locale of the session (pt-BR: ";" and decimal comma, dates dd/MM/yyyy; en: "," and decimal point, dates ' +
            'yyyy-MM-dd). Amount and date are numbers and dates in the xlsx, never text; text that starts with a formula ' +
            'character is prefixed with an apostrophe. At most 50,000 rows per file.'
    })
    @ApiZodQuery(transactionsExportBaseSchema)
    @ApiProduces(XLSX_TYPE, CSV_TYPE)
    @ApiResponse({
        status: 200,
        description: 'The file as an attachment named vera-transacoes-YYYY-MM-DD.xlsx or .csv (date in the company timezone)',
        content: { [XLSX_TYPE]: { schema: FILE_SCHEMA }, [`${CSV_TYPE}; charset=utf-8`]: { schema: FILE_SCHEMA } }
    })
    @ApiProblemResponse({
        status: 400,
        description:
            'Invalid query: format is not xlsx or csv, or the range is unordered or longer than 400 days (zod details in meta.errors)',
        example: {
            type: 'validation_failed',
            title: 'ZodValidationException',
            status: 400,
            detail: 'Validation failed.',
            requestId: '0199c3a0-0000-7000-8000-000000000001'
        }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 404,
        description: 'The accountId does not belong to the company (transactions.account_not_found)',
        example: { type: 'transactions.account_not_found', title: 'AccountNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The filter matches more than 50,000 transactions; meta.rows has the count. Choose a shorter period',
        example: {
            type: 'transactions.export_too_large',
            title: 'ExportTooLargeError',
            status: 422,
            detail: 'The filter matches more transactions than a single export can hold. Choose a shorter period.',
            meta: { rows: 63000, limit: 50000 }
        }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 10 exports in a minute for the company',
        example: {
            type: 'core.too_many_attempts',
            title: 'TooManyAttemptsError',
            status: 429,
            detail: 'Too many attempts for this key within the configured window.',
            requestId: '0199c3a0-0000-7000-8000-000000000002'
        }
    })
    public async export(@Query() query: TransactionsExportQueryDto): Promise<StreamableFile> {
        const { format, ...filters } = query;
        const file: ExportFile = await this.exports.export(format, filters);
        return new StreamableFile(file.content, {
            type: file.contentType,
            disposition: `attachment; filename="${file.filename}"`,
            length: file.content.length
        });
    }
}
