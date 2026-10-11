import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { SummaryApplication } from '../../application/summary.application';
import { MonthlySummary } from '../../domain/spending-summary.types';
import { monthlySummarySchema, SummaryQueryDto, summaryQuerySchema } from '../../validation/spending-summary.schemas';

const SUMMARY_DESCRIPTION: string =
    'Monthly summary computed on demand from the transactions, in BRL and integer cents (accounts in another currency are left out and ' +
    'counted in `excludedCurrencyCount`). Without `month`, returns the last closed month in the company timezone. ' +
    'Formulas: `spentMinor` of an expense category is minus the sum of its transactions in the month (a refund reduces it). ' +
    '`uncategorizedMinor` is minus the sum of the outflows without category; inflows without category are neither income nor expense ' +
    '(`uncategorizedInflowMinor`). `expensesMinor` = sum of `spentMinor` + `uncategorizedMinor`. `income.minor` is the sum of the `income` ' +
    'transactions (mode `transactions`) or `declaredIncomeMinor` (mode `declared`). `savedMinor` = income - expenses. ' +
    '`savingsRateBps` = round(saved * 10000 / income), half up, null when income is 0. `goal.minor` = round(income * goal.bps / 10000). ' +
    '`gapMinor` = max(0, goal - saved). `fixedMinor` and `flexibleMinor` sum `spentMinor` by flexibility; `fixedShareBps` = fixed / income. ' +
    '`transfersOutMinor` is the outflow of `transfer` categories (card bill payments, investments, own transfers), informative only. ' +
    'The average of a category is the mean of `spentMinor` over the 3 calendar months before `month` that have at least one transaction ' +
    '(`averageMonths` = how many entered; `averageMinor` and `deltaBps` are null with 0). `deltaBps` = round((spent - average) * 10000 / average) ' +
    'when average > 0; with average 0 and spent > 0 it is null and `isNew` is true. `categories` lists expense categories with spending or ' +
    'average, by `spentMinor` descending then `position`. `incomeCategories` carries the received amount in `spentMinor`, without average. ' +
    'Sample transactions count. A future month or a malformed one returns 422.';

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/summary')
export class SummaryController {
    public constructor(private readonly summary: SummaryApplication) {}

    @Get()
    @ApiOperation({ summary: 'Monthly spending summary', description: SUMMARY_DESCRIPTION })
    @ApiZodQuery(summaryQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Monthly summary', schema: monthlySummarySchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'Malformed, earlier than 2000-01 or future month (summary.invalid_month)',
        example: { type: 'summary.invalid_month', title: 'InvalidSummaryMonthError', status: 422 }
    })
    public async get(@Query() query: SummaryQueryDto): Promise<MonthlySummary> {
        return this.summary.get(query.month);
    }
}
