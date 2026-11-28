import { Controller, Get, HttpStatus, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { PremiumGuard } from '../../../plans/services/premium.guard';
import { RequiresFeature } from '../../../plans/services/requires-feature.decorator';
import { AiPayloadApplication, AiPayloadView } from '../../application/ai-payload.application';
import { PayloadQueryDto, payloadQuerySchema, payloadResponseSchema } from '../../validation/ai-payload.schemas';

const NO_STORE: string = 'no-store';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PremiumGuard)
@Controller('ai/payload')
export class AiPayloadController {
    public constructor(private readonly payloads: AiPayloadApplication) {}

    @Get()
    @RequiresRole('viewer')
    @RequiresFeature('ai')
    @ApiOperation({
        summary: 'What would be sent to the language model for a summary',
        description:
            'Builds the context with the same builder the summary uses and returns it serialized the same way: figures only, formatted ' +
            'in the effective locale, with stable keys (`chave`) in place of names. It does not require the permission, because it is what ' +
            'the person reads before allowing. 204 when there is no data for that kind (the summary card does not appear).'
    })
    @ApiZodQuery(payloadQuerySchema)
    @ApiZodResponse({ status: 200, description: 'The exact object sent to the model', schema: payloadResponseSchema })
    @ApiNoContentResponse({ description: 'No data for that kind' })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid query (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 402,
        description: 'The plan does not include the feature (billing.premium_required)',
        example: { type: 'billing.premium_required', title: 'PremiumRequiredError', status: 402, meta: { feature: 'ai' } }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'Malformed, earlier than 2000-01 or future month (summary.invalid_month)',
        example: { type: 'summary.invalid_month', title: 'InvalidSummaryMonthError', status: 422 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'The monthly cap of paid usage of the account plan is reached (usage.cap_reached, with meta.plan free or premium)',
        example: {
            type: 'usage.cap_reached',
            title: 'CapReachedError',
            status: 429,
            meta: { feature: 'ai', resetsAt: '2026-12-01T03:00:00.000Z', plan: 'free' }
        }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'The installation has no model credentials (billing.feature_disabled)',
        example: { type: 'billing.feature_disabled', title: 'FeatureDisabledError', status: 503, meta: { feature: 'ai' } }
    })
    public async get(@Query() query: PayloadQueryDto, @Res({ passthrough: true }) response: Response): Promise<AiPayloadView | undefined> {
        const view: AiPayloadView | null = await this.payloads.build(query);
        response.setHeader('Cache-Control', NO_STORE);
        if (view === null) {
            response.status(HttpStatus.NO_CONTENT);
            return undefined;
        }
        return view;
    }
}
