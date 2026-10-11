import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { CutsApplication } from '../../application/cuts.application';
import { CutsResult } from '../../domain/spending-cuts.types';
import { CutsQueryDto, cutsQuerySchema, cutsResponseSchema } from '../../validation/spending-cuts.schemas';

const CUTS_PER_MINUTE: number = 120;
const ONE_MINUTE_SECONDS: number = 60;

const CUTS_DESCRIPTION: string =
    'Deterministic cut suggestion computed from the monthly summary (same `month` rules as `GET /spending/summary`; without `month`, ' +
    'the last closed month). Nothing is stored. `goalBps` simulates another goal in this response only; save it with `PUT /spending/settings`. ' +
    'Gap: `gapMinor` = max(0, goal - saved). Candidates: expense categories with `flexibility = flexible` and `spentMinor > 0`; ' +
    '`excessMinor` = max(0, spent - average), and 0 when there is no average. Ideal cut: when the gap is 0 it is 0; when the total excess ' +
    'covers the gap, `excess * gap / total excess`; otherwise `min(spent, excess + (gap - total excess) * spent / total flexible spent)`. ' +
    'Exact rounding: `totalCutMinor` is the sum of the ideal cuts rounded half up; each cut is floored and the missing cents go to the ' +
    'largest remainders (ties: higher spent, then `systemKey` or `categoryId` in lexical order). So the sum of `cutMinor` equals ' +
    '`totalCutMinor`, `0 <= cutMinor <= spentMinor` and `limitMinor = spentMinor - cutMinor`. `limitMonth` is the month after `month`; ' +
    '`isPartial` is true for the current month, which is not closed yet. `categoriesWithCut` counts cuts of at least 100 cents. ' +
    '`uncategorizedMinor` lowers what was saved but is left out of the cuts. Status: `no_data` (no transactions, empty list), ' +
    '`no_income` (income 0, empty list), `goal_met` (gap 0, all cuts 0, `surplusMinor` = saved - goal), `cut_suggested` (gap within the ' +
    'flexible total) and `exceeds_flexible` (gap above the flexible total: every category is cut to zero and the goal requires ' +
    'reviewing fixed spending or income). Sorted by cut descending, then spent descending, then category position.';

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/cuts')
export class CutsController {
    public constructor(private readonly cuts: CutsApplication) {}

    @Get()
    @RateLimit({
        key: 'spending-cuts',
        limit: CUTS_PER_MINUTE,
        windowSeconds: ONE_MINUTE_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({ summary: 'Suggest where to cut to reach the savings goal', description: CUTS_DESCRIPTION })
    @ApiZodQuery(cutsQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Cut suggestion', schema: cutsResponseSchema })
    @ApiProblemResponse({
        status: 400,
        description: '`goalBps` outside 0 to 9000 or not an integer (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
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
    public async get(@Query() query: CutsQueryDto): Promise<CutsResult> {
        return this.cuts.get(query.month, query.goalBps);
    }
}
