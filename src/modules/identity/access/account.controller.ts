import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { AccountDeletionApplication } from '../application/account-deletion.application';
import { AccountExportApplication, AccountExportFile } from '../application/account-export.application';
import { AccountSpreadsheetExportApplication, AccountSpreadsheetExportFile } from '../application/account-spreadsheet-export.application';
import { RateLimit, RateLimitSubject } from '../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../services/jwt-auth.guard';
import { RequiresRole } from '../services/requires-role.decorator';
import { RolesGuard } from '../services/roles.guard';
import { RefreshCookieAdapter } from '../services/refresh-cookie.adapter';
import { accountExportSchema, DeleteAccountDto, deleteAccountSchema } from '../validation/account.schemas';

const DATE_LENGTH: number = 10;
const SPREADSHEET_EXPORTS_PER_HOUR: number = 3;
const ONE_HOUR_SECONDS: number = 60 * 60;
const ZIP_TYPE: string = 'application/zip';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('owner')
@Controller('account')
export class AccountController {
    public constructor(
        private readonly exportApplication: AccountExportApplication,
        private readonly spreadsheetApplication: AccountSpreadsheetExportApplication,
        private readonly deletionApplication: AccountDeletionApplication,
        private readonly refreshCookie: RefreshCookieAdapter
    ) {}

    @Get('export')
    @Header('Content-Type', 'application/json; charset=utf-8')
    @ApiOperation({
        summary: 'Download everything Vera keeps about the signed-in account',
        description:
            'One JSON attachment with the identity data under `account` and one entry per module under `sections`. ' +
            'It is delivered whole or not at all: a module that fails to export turns the answer into a 500.'
    })
    @ApiZodResponse({ status: 200, description: 'JSON attachment vera-export-<date>.json', schema: accountExportSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many exports for this user (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    @ApiProblemResponse({
        status: 500,
        description: 'An area failed to export (identity.export_failed, meta.area)',
        example: { type: 'identity.export_failed', title: 'AccountExportFailedError', status: 500 }
    })
    public async exportData(@Res({ passthrough: true }) res: Response): Promise<AccountExportFile> {
        const file: AccountExportFile = await this.exportApplication.export();
        res.setHeader('Content-Disposition', `attachment; filename="vera-export-${file.exportedAt.slice(0, DATE_LENGTH)}.json"`);
        return file;
    }

    @Get('export/spreadsheets')
    @Header('Cache-Control', 'no-store')
    @RateLimit({
        key: 'account-spreadsheet-export',
        limit: SPREADSHEET_EXPORTS_PER_HOUR,
        windowSeconds: ONE_HOUR_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Download everything Vera keeps about the account as spreadsheets',
        description:
            'A zip with one xlsx per subject (carteira, metas, transacoes, regras and whatever other module registers) and ' +
            'dados.json, the same document as GET /account/export. Sheet names and headers follow the session locale. ' +
            'Transactions above 50 thousand rows continue in transacoes-2.xlsx and so on. Sample data is left out. ' +
            'Only the owner can export, because the file carries the personal data of every person in the account.'
    })
    @ApiProduces(ZIP_TYPE)
    @ApiResponse({
        status: 200,
        description: 'The zip as an attachment named vera-meus-dados-YYYY-MM-DD.zip (date in the company timezone)',
        content: { [ZIP_TYPE]: { schema: { type: 'string', format: 'binary' } } }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'Only the owner can export (members.forbidden_role)',
        example: { type: 'members.forbidden_role', title: 'RoleForbiddenError', status: 403 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 3 exports in an hour for the company (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    @ApiProblemResponse({
        status: 500,
        description: 'An area failed to export (identity.export_failed, meta.area)',
        example: { type: 'identity.export_failed', title: 'AccountExportFailedError', status: 500 }
    })
    public async exportSpreadsheets(): Promise<StreamableFile> {
        const file: AccountSpreadsheetExportFile = await this.spreadsheetApplication.export();
        return new StreamableFile(file.stream, { type: ZIP_TYPE, disposition: `attachment; filename="${file.filename}"` });
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Delete the account and every piece of data behind it',
        description:
            'Immediate and irreversible. The owner confirms by typing their email again. Every registered eraser runs first, ' +
            'then the company row is deleted and the foreign keys cascade. Clears the rt_refresh cookie.'
    })
    @ApiZodBody(deleteAccountSchema)
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'Only the owner can delete the company (members.forbidden_role)',
        example: { type: 'members.forbidden_role', title: 'RoleForbiddenError', status: 403 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'Typed email does not match (identity.confirmation_mismatch)',
        example: { type: 'identity.confirmation_mismatch', title: 'ConfirmationMismatchError', status: 422 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many attempts for this user (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    @ApiProblemResponse({
        status: 500,
        description: 'An area failed to erase, nothing was deleted (identity.erasure_failed, meta.area)',
        example: { type: 'identity.erasure_failed', title: 'AccountErasureFailedError', status: 500 }
    })
    public async deleteAccount(@Body() body: DeleteAccountDto, @Res({ passthrough: true }) res: Response): Promise<void> {
        await this.deletionApplication.delete(body.confirmEmail);
        this.refreshCookie.clear(res);
    }
}
