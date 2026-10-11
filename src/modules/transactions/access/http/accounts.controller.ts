import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { AccountApplication } from '../../application/account.application';
import { AccountView } from '../../domain/transactions.types';
import {
    AccountIdParamsDto,
    accountListSchema,
    accountViewSchema,
    RenameAccountDto,
    renameAccountSchema
} from '../../validation/transactions.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const NOT_FOUND: string = 'The financial account does not exist in this company (transactions.account_not_found)';
const ACCOUNT_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Financial account id' };

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
const NOT_FOUND_EXAMPLE: Record<string, unknown> = { type: 'transactions.account_not_found', title: 'AccountNotFoundError', status: 404 };

const ACCOUNT_EXAMPLE: Record<string, unknown> = {
    id: '0199c3a0-2222-7c52-9d0e-3f6a1b2c4d5e',
    name: 'Nubank Cartão',
    kind: 'credit_card',
    institutionName: 'Nubank',
    numberLast4: '4321',
    currency: 'BRL',
    source: 'pluggy',
    transactionCount: 42,
    lastTransactionDate: '2026-10-01',
    isSample: false
};

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/accounts')
export class AccountsController {
    public constructor(private readonly accounts: AccountApplication) {}

    @Get()
    @ApiOperation({
        summary: 'List the financial accounts of the company',
        description: 'Accounts from bank connections and from imported statements, oldest first.'
    })
    @ApiZodResponse({ status: 200, description: 'Financial accounts', schema: accountListSchema, example: { accounts: [ACCOUNT_EXAMPLE] } })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async list(): Promise<{ accounts: AccountView[] }> {
        return this.accounts.list();
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Rename a financial account',
        description: 'Works for accounts from a bank connection and for accounts from files.'
    })
    @ApiParam(ACCOUNT_ID_PARAM)
    @ApiZodBody(renameAccountSchema)
    @ApiZodResponse({ status: 200, description: 'Account renamed', schema: accountViewSchema, example: ACCOUNT_EXAMPLE })
    @ApiProblemResponse({ status: 400, description: 'Invalid payload (zod validation details in meta.errors)', example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    public async rename(@Param() params: AccountIdParamsDto, @Body() body: RenameAccountDto): Promise<AccountView> {
        return this.accounts.rename(params.id, body.name);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Delete an account created from files',
        description:
            'Soft deletes the account, its transactions and its imports. Accounts that come from a bank connection are removed together with the connection.'
    })
    @ApiParam(ACCOUNT_ID_PARAM)
    @ApiNoContentResponse({ description: 'Account deleted' })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({
        status: 422,
        description: 'The account comes from a bank connection (transactions.account_managed_by_connection)',
        example: { type: 'transactions.account_managed_by_connection', title: 'AccountManagedByConnectionError', status: 422 }
    })
    public async remove(@Param() params: AccountIdParamsDto): Promise<void> {
        await this.accounts.remove(params.id);
    }
}
