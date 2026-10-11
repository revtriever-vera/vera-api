import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { AccountDeletionApplication } from '../application/account-deletion.application';
import { AccountExportApplication, AccountExportFile } from '../application/account-export.application';
import { JwtAuthGuard } from '../services/jwt-auth.guard';
import { RefreshCookieAdapter } from '../services/refresh-cookie.adapter';
import { accountExportSchema, DeleteAccountDto, deleteAccountSchema } from '../validation/account.schemas';

const DATE_LENGTH: number = 10;

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
    public constructor(
        private readonly exportApplication: AccountExportApplication,
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
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    @ApiProblemResponse({ status: 429, description: 'Too many exports for this user (core.too_many_attempts)' })
    @ApiProblemResponse({ status: 500, description: 'An area failed to export (identity.export_failed, meta.area)' })
    public async exportData(@Res({ passthrough: true }) res: Response): Promise<AccountExportFile> {
        const file: AccountExportFile = await this.exportApplication.export();
        res.setHeader('Content-Disposition', `attachment; filename="vera-export-${file.exportedAt.slice(0, DATE_LENGTH)}.json"`);
        return file;
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
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    @ApiProblemResponse({ status: 403, description: 'Only the owner can delete the company (identity.forbidden)' })
    @ApiProblemResponse({ status: 422, description: 'Typed email does not match (identity.confirmation_mismatch)' })
    @ApiProblemResponse({ status: 429, description: 'Too many attempts for this user (core.too_many_attempts)' })
    @ApiProblemResponse({ status: 500, description: 'An area failed to erase, nothing was deleted (identity.erasure_failed, meta.area)' })
    public async deleteAccount(@Body() body: DeleteAccountDto, @Res({ passthrough: true }) res: Response): Promise<void> {
        await this.deletionApplication.delete(body.confirmEmail);
        this.refreshCookie.clear(res);
    }
}
