import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { TransactionListApplication, TransactionListView } from '../../application/transaction-list.application';
import { RecategorizedView, TransactionRecategorizeApplication } from '../../application/transaction-recategorize.application';
import {
    ListQueryDto,
    listQueryBaseSchema,
    RecategorizeDto,
    recategorizeSchema,
    recategorizedSchema,
    TransactionIdParamsDto,
    transactionListSchema,
    uncategorizedCountSchema
} from '../../validation/transactions.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid query or payload (zod validation details in meta.errors)';
const TRANSACTION_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Transaction id' };

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
const NOT_FOUND_EXAMPLE: Record<string, unknown> = {
    type: 'transactions.transaction_not_found',
    title: 'TransactionNotFoundError',
    status: 404
};

const TRANSACTION_EXAMPLE: Record<string, unknown> = {
    id: '0199c3a0-7b1e-7c52-9d0e-3f6a1b2c4d5e',
    accountId: '0199c3a0-2222-7c52-9d0e-3f6a1b2c4d5e',
    accountName: 'Nubank Cartão',
    date: '2026-09-22',
    amountMinor: -229560,
    currency: 'BRL',
    description: 'RESTAURANTE COCO BAMBU',
    counterpartyName: null,
    categoryId: '0199c3a0-1111-7c52-9d0e-3f6a1b2c4d5e',
    categorySource: 'provider',
    ruleId: null,
    source: 'pluggy',
    installment: null,
    isSample: false
};

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/transactions')
export class TransactionsController {
    public constructor(
        private readonly list: TransactionListApplication,
        private readonly recategorization: TransactionRecategorizeApplication
    ) {}

    @Get()
    @ApiOperation({
        summary: 'List the transactions of the company',
        description:
            'Newest first (date, then id). Without `month`, `from` and `to` it lists the current month in the time zone of the company. ' +
            '`totals` cover the whole query, not only the page.'
    })
    @ApiZodQuery(listQueryBaseSchema)
    @ApiZodResponse({
        status: 200,
        description: 'Page of transactions with the totals of the query',
        schema: transactionListSchema,
        example: {
            data: [TRANSACTION_EXAMPLE],
            pagination: { page: 1, pageSize: 50, totalRecords: 1, totalPages: 1 },
            totals: { inMinor: 0, outMinor: -229560, count: 1 }
        }
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async listTransactions(@Query() query: ListQueryDto): Promise<TransactionListView> {
        return this.list.list(query);
    }

    @Get('uncategorized-count')
    @ApiOperation({
        summary: 'Count the outgoing transactions without category',
        description: 'Counts all time, example data excluded. Feeds the counter of the menu.'
    })
    @ApiZodResponse({
        status: 200,
        description: 'Number of uncategorized outgoing transactions',
        schema: uncategorizedCountSchema,
        example: { count: 2 }
    })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async uncategorizedCount(): Promise<{ count: number }> {
        return this.list.uncategorizedCount();
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Recategorize a transaction',
        description:
            'A category chosen here is final: no sync and no rule overwrites it. `categoryId: null` goes back to the automatic ' +
            'categorization. With `rule` it also creates or updates the rule "always to this category" and applies it to the past, ' +
            'all in one database transaction; `recategorized` counts the other transactions that changed.'
    })
    @ApiParam(TRANSACTION_ID_PARAM)
    @ApiZodBody(recategorizeSchema)
    @ApiZodResponse({
        status: 200,
        description: 'Transaction updated',
        schema: recategorizedSchema,
        example: {
            transaction: { ...TRANSACTION_EXAMPLE, categorySource: 'user' },
            rule: {
                id: '0199c3a0-3333-7c52-9d0e-3f6a1b2c4d5e',
                matchType: 'counterparty',
                label: 'Maria Souza',
                appliesTo: 'out',
                categoryId: '0199c3a0-1111-7c52-9d0e-3f6a1b2c4d5e',
                createdAt: '2026-10-12T10:00:00.000Z',
                updatedAt: '2026-10-12T10:00:00.000Z'
            },
            recategorized: 1
        }
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description:
            'The transaction or the category does not exist in this company (transactions.transaction_not_found, categories.category_not_found)',
        example: NOT_FOUND_EXAMPLE
    })
    @ApiProblemResponse({
        status: 422,
        description:
            'Income category on an outgoing transaction (transactions.category_kind_mismatch) or a rule that cannot be created ' +
            'from this transaction (categories.invalid_rule), including the 500 rules limit (categories.limit_reached)',
        example: { type: 'transactions.category_kind_mismatch', title: 'CategoryKindMismatchError', status: 422 }
    })
    public async recategorize(@Param() params: TransactionIdParamsDto, @Body() body: RecategorizeDto): Promise<RecategorizedView> {
        return this.recategorization.recategorize(params.id, body);
    }
}
