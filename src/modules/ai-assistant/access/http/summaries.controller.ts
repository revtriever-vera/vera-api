import { applyDecorators, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiProblemResponse, ProblemDoc } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { PremiumGuard } from '../../../plans/services/premium.guard';
import { RequiresFeature } from '../../../plans/services/requires-feature.decorator';
import { SummariesApplication } from '../../application/summaries.application';
import { SummaryView } from '../../domain/summary.types';
import {
    SummaryKindParamsDto,
    SummaryQueryDto,
    SummaryRegenerateBodyDto,
    summaryQuerySchema,
    summaryRegenerateBodySchema,
    summaryResponseSchema
} from '../../validation/summaries.schemas';

const NO_STORE: string = 'no-store';
const REGENERATIONS_PER_HOUR: number = 5;
const ONE_HOUR_SECONDS: number = 3600;

const VIEW_EXAMPLE: SummaryView = {
    kind: 'month',
    period: '2026-09',
    paragraphs: ['Entraram **R$ 28.000** e saíram R$ 22.400.', 'Os fixos somam R$ 11.200, 40% da renda, sem mudança.'],
    generatedAt: '2026-11-23T12:00:00.000Z',
    cached: false,
    stale: false,
    source: 'model',
    usage: { state: 'ok', usedBps: 120, resetsAt: '2026-12-01T03:00:00.000Z' }
};

const PROBLEMS: readonly ProblemDoc[] = [
    {
        status: 400,
        description: 'Invalid query, params or body (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    },
    {
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    },
    {
        status: 402,
        description: 'The plan does not include the feature (billing.premium_required)',
        example: { type: 'billing.premium_required', title: 'PremiumRequiredError', status: 402, meta: { feature: 'ai' } }
    },
    {
        status: 403,
        description: 'The account did not allow sending figures to a language model (ai.consent_required)',
        example: { type: 'ai.consent_required', title: 'AiConsentRequiredError', status: 403 }
    },
    {
        status: 422,
        description: 'Malformed, earlier than 2000-01 or future month (summary.invalid_month)',
        example: { type: 'summary.invalid_month', title: 'InvalidSummaryMonthError', status: 422 }
    },
    {
        status: 429,
        description:
            'The monthly cap of paid usage is reached (usage.cap_reached) or the hourly limit of rewrites passed (rate_limit.exceeded)',
        example: {
            type: 'usage.cap_reached',
            title: 'CapReachedError',
            status: 429,
            meta: { feature: 'ai', resetsAt: '2026-12-01T03:00:00.000Z' }
        }
    },
    {
        status: 502,
        description: 'The model answered twice with a text that failed the checks (ai.invalid_response); nothing was stored',
        example: { type: 'ai.invalid_response', title: 'LlmInvalidResponseError', status: 502, meta: { task: 'summary_month' } }
    },
    {
        status: 503,
        description:
            'The installation has no model credentials or the provider did not answer (billing.feature_disabled, ai.provider_unavailable)',
        example: { type: 'billing.feature_disabled', title: 'FeatureDisabledError', status: 503, meta: { feature: 'ai' } }
    }
];

function problemsOf(): MethodDecorator {
    return applyDecorators(...PROBLEMS.map((problem: ProblemDoc): MethodDecorator => ApiProblemResponse(problem)));
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PremiumGuard)
@Controller('ai/summaries')
export class SummariesController {
    public constructor(private readonly summaries: SummariesApplication) {}

    @Get(':kind')
    @RequiresRole('viewer')
    @RequiresFeature('ai')
    @ApiOperation({
        summary: 'The written summary of the month, of the savings cuts or of the portfolio',
        description:
            'Returns the stored text when the figures did not change (`cached`). When they changed, writes a new one, at most once per hour ' +
            'automatically: inside the hour it returns the stored text with `stale: true`. A savings goal already met gets a fixed text ' +
            '(`source: fixed`) with no model call and no permission. Needs the permission of the account for the model text. 204 when there ' +
            'is no data (the card does not appear).'
    })
    @ApiParam({ name: 'kind', enum: ['month', 'cuts', 'portfolio'], description: 'Which summary' })
    @ApiZodQuery(summaryQuerySchema)
    @ApiZodResponse({ status: 200, description: 'The summary', schema: summaryResponseSchema, example: VIEW_EXAMPLE })
    @ApiNoContentResponse({ description: 'No data for that kind' })
    @problemsOf()
    public async get(
        @Param() params: SummaryKindParamsDto,
        @Query() query: SummaryQueryDto,
        @Res({ passthrough: true }) response: Response
    ): Promise<SummaryView | undefined> {
        return this.answer(response, await this.summaries.get(params.kind, query));
    }

    @Post(':kind/regenerate')
    @RequiresRole('editor')
    @RequiresFeature('ai')
    @HttpCode(HttpStatus.OK)
    @RateLimit({
        key: 'ai-summary-regenerate',
        limit: REGENERATIONS_PER_HOUR,
        windowSeconds: ONE_HOUR_SECONDS,
        identify: (subject: RateLimitSubject): string | null =>
            subject.companyId === undefined ? null : `${subject.companyId}:${subject.params['kind'] ?? ''}`
    })
    @ApiOperation({
        summary: 'Write the summary again',
        description:
            'Writes a new text even when the figures did not change, at most 5 times per hour per account and kind. Needs the permission of ' +
            'the account and an editor or owner role.'
    })
    @ApiParam({ name: 'kind', enum: ['month', 'cuts', 'portfolio'], description: 'Which summary' })
    @ApiZodBody(summaryRegenerateBodySchema)
    @ApiZodResponse({ status: 200, description: 'The new summary', schema: summaryResponseSchema, example: VIEW_EXAMPLE })
    @ApiNoContentResponse({ description: 'No data for that kind' })
    @problemsOf()
    public async regenerate(
        @Param() params: SummaryKindParamsDto,
        @Body() body: SummaryRegenerateBodyDto,
        @Res({ passthrough: true }) response: Response
    ): Promise<SummaryView | undefined> {
        return this.answer(response, await this.summaries.regenerate(params.kind, body));
    }

    private answer(response: Response, view: SummaryView | null): SummaryView | undefined {
        response.setHeader('Cache-Control', NO_STORE);
        if (view === null) {
            response.status(HttpStatus.NO_CONTENT);
            return undefined;
        }
        return view;
    }
}
