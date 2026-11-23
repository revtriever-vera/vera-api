import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { PlatformOnly } from '../../identity/services/platform-only.decorator';
import { PlatformAccountsApplication } from '../application/platform-accounts.application';
import {
    accessRequestSchema,
    AccessRequestDto,
    accessResponseSchema,
    AccessResponseView,
    AccountIdParamsDto,
    AccountListView,
    accountListSchema,
    AccountsQueryDto,
    accountsQuerySchema,
    OverviewView,
    overviewSchema
} from '../validation/platform-accounts.schemas';

const UNAUTHORIZED: { type: string; title: string; status: number } = {
    type: 'identity.unauthorized',
    title: 'UnauthorizedError',
    status: 401
};
const NOT_PLATFORM: { type: string; title: string; status: number } = {
    type: 'identity.platform_only',
    title: 'PlatformOnlyError',
    status: 403
};
const SELF_HOSTED: { type: string; title: string; status: number } = {
    type: 'identity.platform_disabled',
    title: 'PlatformDisabledError',
    status: 404
};

@ApiTags('platform')
@PlatformOnly()
@Controller('platform')
export class PlatformAccountsController {
    public constructor(private readonly accounts: PlatformAccountsApplication) {}

    @Get('overview')
    @ApiOperation({
        summary: 'Platform numbers',
        description: 'Counts of customer accounts and plans. Metadata only; the platform company is never counted.'
    })
    @ApiZodResponse({ status: 200, description: 'The numbers', schema: overviewSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({ status: 403, description: 'Not of the platform company (identity.platform_only)', example: NOT_PLATFORM })
    @ApiProblemResponse({ status: 404, description: 'Self-hosted deployment (identity.platform_disabled)', example: SELF_HOSTED })
    public async overview(): Promise<OverviewView> {
        return this.accounts.overview();
    }

    @Get('accounts')
    @ApiOperation({
        summary: 'List customer accounts',
        description:
            'Newest first, with an optional name search. Metadata only: opening what is inside an account goes through the access route, which asks for a reason.'
    })
    @ApiZodQuery(accountsQuerySchema)
    @ApiZodResponse({ status: 200, description: 'One page of accounts', schema: accountListSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({ status: 403, description: 'Not of the platform company (identity.platform_only)', example: NOT_PLATFORM })
    @ApiProblemResponse({ status: 404, description: 'Self-hosted deployment (identity.platform_disabled)', example: SELF_HOSTED })
    public async list(@Query() query: AccountsQueryDto): Promise<AccountListView> {
        return this.accounts.list(query);
    }

    @Post('accounts/:id/access')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Open an account, with a reason',
        description:
            'Returns the layers asked for: `summary` (plan, subscription and invoices, offer, quota, people) and `data` (portfolio, goals, ' +
            'spending, transactions and connected banks, read only). The reason is mandatory and `account.viewed` is recorded, with the reason ' +
            'and the layers, in the same transaction as the read: no audit entry, no data. Keys, credentials, tokens, card data and WhatsApp ' +
            'conversations never come out. The account owner sees the access in "Support accesses".'
    })
    @ApiZodBody(accessRequestSchema)
    @ApiZodResponse({ status: 200, description: 'The layers asked for', schema: accessResponseSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Missing reason or layers (core.validation_failed)',
        example: { type: 'core.validation_failed', title: 'ValidationError', status: 400 }
    })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({ status: 403, description: 'Not of the platform company (identity.platform_only)', example: NOT_PLATFORM })
    @ApiProblemResponse({
        status: 404,
        description: 'No such customer account (platform.account_not_found) or self-hosted deployment (identity.platform_disabled)',
        example: { type: 'platform.account_not_found', title: 'PlatformAccountNotFoundError', status: 404 }
    })
    public async access(@Param() params: AccountIdParamsDto, @Body() body: AccessRequestDto): Promise<AccessResponseView> {
        return this.accounts.access(params.id, body);
    }
}
