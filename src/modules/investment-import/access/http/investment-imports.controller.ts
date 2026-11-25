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
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { Page } from '../../../../shared/pagination/pagination.types';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { InvestmentImportCommitApplication } from '../../application/investment-import-commit.application';
import { InvestmentImportListApplication } from '../../application/investment-import-list.application';
import { InvestmentImportPreviewApplication } from '../../application/investment-import-preview.application';
import { FileRequiredError } from '../../domain/investment-import.errors';
import {
    CommitView,
    IMPORTS_PER_HOUR,
    ImportRecordView,
    ONE_HOUR_SECONDS,
    PREVIEWS_PER_HOUR,
    PreviewView,
    UploadedReport
} from '../../domain/investment-import.types';
import {
    CommitBodyDto,
    commitBodySchema,
    importCommitSchema,
    ImportIdParamsDto,
    importListQuerySchema,
    importListSchema,
    ImportListQueryDto,
    importPreviewSchema,
    importUndoneSchema,
    multipartBodyOf,
    PreviewBodyDto,
    previewBodySchema
} from '../../validation/investment-import.schemas';
import {
    COMMIT_EXAMPLE,
    EXAMPLE_IDS,
    IMPORT_RECORD_EXAMPLE,
    INVALID_EXAMPLE,
    PREVIEW_EXAMPLE,
    PROBLEM_EXAMPLES,
    THROTTLED_EXAMPLE,
    UNAUTHORIZED_EXAMPLE
} from './investment-imports.examples';
import { InvestmentUploadInterceptor } from './investment-upload.interceptor';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const FORBIDDEN: string = 'The member is a viewer (identity.insufficient_role)';
const INVALID: string = 'Invalid fields or missing file (zod validation details in meta.errors)';
const IMPORT_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Import id' };

function companyOf(subject: RateLimitSubject): string | null {
    return subject.companyId ?? null;
}

function requireFile(file: UploadedReport | undefined): UploadedReport {
    if (file === undefined) {
        throw new FileRequiredError();
    }
    return file;
}

@ApiTags('investment-imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('investment-imports')
export class InvestmentImportsController {
    public constructor(
        private readonly previews: InvestmentImportPreviewApplication,
        private readonly commits: InvestmentImportCommitApplication,
        private readonly list: InvestmentImportListApplication
    ) {}

    @Post('preview')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @RateLimit({ key: 'investment-import-preview', limit: PREVIEWS_PER_HOUR, windowSeconds: ONE_HOUR_SECONDS, identify: companyOf })
    @UseInterceptors(InvestmentUploadInterceptor)
    @ApiOperation({
        summary: 'Preview an investment report and its effect on the portfolio',
        description:
            'Reads a B3 report (xlsx or csv: Negociação, Movimentação or Posição) and returns every line with its status, the position ' +
            'of each asset before and after, and what was left out. The file is discarded as soon as it is read and never stored: only ' +
            'the operations read are kept for 30 minutes, waiting for POST /investment-imports. In a Posição report, each fixed income ' +
            'title (CDB, LCI, LCA...) comes back with a proposal: the contracted rate is calculated from the CURVA price and the ' +
            'CDI and IPCA series, and is only saved when the person confirms it. Available on every plan.'
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: multipartBodyOf(previewBodySchema) })
    @ApiZodResponse({
        status: 200,
        description: 'What the report holds and what would happen',
        schema: importPreviewSchema,
        example: PREVIEW_EXAMPLE
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: PROBLEM_EXAMPLES.forbidden })
    @ApiProblemResponse({ status: 413, description: 'The file is larger than 10 MB (file.too_large)', example: PROBLEM_EXAMPLES.tooLarge })
    @ApiProblemResponse({
        status: 422,
        description:
            'Not a report the reader knows (format.not_recognized, meta.suggestion says what is accepted) or too many rows (format.too_many_rows)',
        example: PROBLEM_EXAMPLES.notRecognized
    })
    @ApiProblemResponse({ status: 429, description: 'More than 60 previews in an hour for the company', example: THROTTLED_EXAMPLE })
    public async preview(@UploadedFile() file: UploadedReport | undefined, @Body() body: PreviewBodyDto): Promise<PreviewView> {
        return this.previews.preview(requireFile(file), body);
    }

    @Post()
    @RequiresRole('editor')
    @RateLimit({ key: 'investment-import', limit: IMPORTS_PER_HOUR, windowSeconds: ONE_HOUR_SECONDS, identify: companyOf })
    @ApiOperation({
        summary: 'Confirm an investment import from its preview',
        description:
            'Records the operations of the preview, with the corrections sent in `edits`, and updates the positions in one transaction. ' +
            'The effect is recalculated with the corrections; the call is refused while a line is `blocked` or while an asset that ' +
            'already has a position has lines without `positionMode`. Each fixed income line in `fixedIncome` is confirmed, corrected with ' +
            '`edits` or skipped; a title that needs input is refused without the required fields (import.fixed_income_incomplete). ' +
            'The preview can be confirmed once. `DELETE /investment-imports/{id}` undoes it, removing the titles it created.'
    })
    @ApiZodBody(commitBodySchema)
    @ApiZodResponse({
        status: 201,
        description: 'The import and the resulting positions',
        schema: importCommitSchema,
        example: COMMIT_EXAMPLE
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: PROBLEM_EXAMPLES.forbidden })
    @ApiProblemResponse({
        status: 410,
        description: 'The preview expired or was already confirmed (preview.expired)',
        example: PROBLEM_EXAMPLES.expired
    })
    @ApiProblemResponse({
        status: 422,
        description:
            'Blocked lines remain (import.has_blocked_lines), a position mode is missing (import.position_mode_required), an edit does ' +
            'not match a line (import.invalid_edit) or a fixed income title lacks fields (import.fixed_income_incomplete)',
        example: PROBLEM_EXAMPLES.blocked
    })
    @ApiProblemResponse({ status: 429, description: 'More than 30 imports in an hour for the company', example: THROTTLED_EXAMPLE })
    public async commit(@Body() body: CommitBodyDto): Promise<CommitView> {
        return this.commits.commit(body);
    }

    @Get()
    @ApiOperation({
        summary: 'List the investment imports of the company',
        description: 'Newest first. The operations are not part of the list.'
    })
    @ApiZodQuery(importListQuerySchema)
    @ApiZodResponse({
        status: 200,
        description: 'Page of imports',
        schema: importListSchema,
        example: { data: [IMPORT_RECORD_EXAMPLE], pagination: { page: 1, pageSize: 50, totalRecords: 1, totalPages: 1 } }
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async listImports(@Query() query: ImportListQueryDto): Promise<Page<ImportRecordView>> {
        return this.list.list(query.page, query.pageSize);
    }

    @Delete(':id')
    @RequiresRole('editor')
    @ApiOperation({
        summary: 'Undo an investment import',
        description:
            'Removes the operations the import recorded and restores the positions as they were before it. Refused when a later import ' +
            'touches the same assets or when a position was edited after the import.'
    })
    @ApiParam(IMPORT_ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'The positions were restored', schema: importUndoneSchema, example: { undone: true } })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: PROBLEM_EXAMPLES.forbidden })
    @ApiProblemResponse({
        status: 404,
        description: 'The import does not exist in this company (positions.import_not_found)',
        example: { type: 'positions.import_not_found', title: 'ImportNotFoundError', status: 404, meta: { importId: EXAMPLE_IDS.import } }
    })
    @ApiProblemResponse({
        status: 409,
        description:
            'A later import or an edit of the position blocks it (import.undo_blocked), or it was already undone (positions.import_not_open)',
        example: PROBLEM_EXAMPLES.undoBlocked
    })
    public async undo(@Param() params: ImportIdParamsDto): Promise<{ undone: boolean }> {
        return this.list.undo(params.id);
    }
}
