import { Controller, Get, Header, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { PortfolioExportApplication } from '../../application/portfolio-export.application';
import { ExportFile } from '../../domain/export.types';
import { PortfolioExportQueryDto, portfolioExportQuerySchema } from '../../validation/portfolio-export.schemas';

const EXPORTS_PER_MINUTE: number = 10;
const ONE_MINUTE_SECONDS: number = 60;
const XLSX_TYPE: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_TYPE: string = 'text/csv';
const FILE_SCHEMA: Readonly<Record<string, string>> = { type: 'string', format: 'binary' };

@ApiTags('portfolio-export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class PortfolioExportController {
    public constructor(private readonly exports: PortfolioExportApplication) {}

    @Get('export')
    @Header('Cache-Control', 'no-store')
    @RateLimit({
        key: 'portfolio-export',
        limit: EXPORTS_PER_MINUTE,
        windowSeconds: ONE_MINUTE_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Download the portfolio as a spreadsheet',
        description:
            'One row per holding: asset, name, class, quantity, value in the base currency and where the value comes from, in the ' +
            'same order and from the same snapshot as the holdings list. Headers, class names and the csv separators follow the ' +
            'locale of the session (pt-BR: ";" and decimal comma; en: "," and decimal point). Quantity and value are numbers, ' +
            'never text; text that starts with a formula character is prefixed with an apostrophe. Fixed income has no quantity.'
    })
    @ApiZodQuery(portfolioExportQuerySchema)
    @ApiProduces(XLSX_TYPE, CSV_TYPE)
    @ApiResponse({
        status: 200,
        description: 'The file as an attachment named vera-carteira-YYYY-MM-DD.xlsx or .csv (date in the company timezone)',
        content: { [XLSX_TYPE]: { schema: FILE_SCHEMA }, [`${CSV_TYPE}; charset=utf-8`]: { schema: FILE_SCHEMA } }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid query: format is not xlsx or csv (zod validation details in meta.errors)',
        example: {
            type: 'validation_failed',
            title: 'ZodValidationException',
            status: 400,
            detail: 'Validation failed.',
            requestId: '0199c3a0-0000-7000-8000-000000000001'
        }
    })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
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
    public async export(@Query() query: PortfolioExportQueryDto): Promise<StreamableFile> {
        const file: ExportFile = await this.exports.export(query.format);
        return new StreamableFile(file.content, {
            type: file.contentType,
            disposition: `attachment; filename="${file.filename}"`,
            length: file.content.length
        });
    }
}
