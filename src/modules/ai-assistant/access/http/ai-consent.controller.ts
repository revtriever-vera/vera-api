import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { PremiumGuard } from '../../../plans/services/premium.guard';
import { RequiresFeature } from '../../../plans/services/requires-feature.decorator';
import { AiConsentApplication } from '../../application/ai-consent.application';
import { ConsentRequestDto, consentRequestSchema, ConsentView, consentViewSchema } from '../../validation/ai-consent.schemas';

const NO_STORE: string = 'no-store';

const VIEW_EXAMPLE: ConsentView = {
    available: true,
    granted: true,
    needsConsent: false,
    noticeVersion: 1,
    acceptedNoticeVersion: 1,
    grantedAt: '2026-11-22T12:00:00.000Z',
    source: 'summary_card',
    canChange: true
};

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const FORBIDDEN_EXAMPLE: Record<string, unknown> = { type: 'identity.forbidden', title: 'ForbiddenError', status: 403 };

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai/consent')
export class AiConsentController {
    public constructor(private readonly consent: AiConsentApplication) {}

    @Get()
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Whether the account allowed sending aggregated figures to a language model',
        description:
            'The permission belongs to the account, not to the person. `needsConsent` is true when it was never given, was turned off, or ' +
            'was given on an older notice version: the summary card must then show the request. `canChange` is false for members who ' +
            'only read (they get 403 on PUT and DELETE).'
    })
    @ApiZodResponse({ status: 200, description: 'Permission state', schema: consentViewSchema, example: VIEW_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async get(): Promise<ConsentView> {
        return this.consent.view();
    }

    @Put()
    @RequiresRole('editor')
    @RequiresFeature('ai')
    @UseGuards(PremiumGuard)
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Allow the account to send aggregated figures to a language model',
        description:
            'Records that the account accepted the current notice. Only totals and shares are sent, never names, descriptions or ids. ' +
            'The notice states that the model provider may use inputs and outputs to train its models (no zero retention). Owner and ' +
            'editor only; the plan must include the feature.'
    })
    @ApiZodBody(consentRequestSchema)
    @ApiZodResponse({ status: 200, description: 'Permission state after the change', schema: consentViewSchema, example: VIEW_EXAMPLE })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid body (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 402,
        description: 'The plan does not include the feature (billing.premium_required)',
        example: { type: 'billing.premium_required', title: 'PremiumRequiredError', status: 402, meta: { feature: 'ai' } }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'Only owner and editor may change it (identity.forbidden)',
        example: FORBIDDEN_EXAMPLE
    })
    @ApiProblemResponse({
        status: 409,
        description: 'The accepted notice is not the current one (ai.notice_outdated)',
        example: { type: 'ai.notice_outdated', title: 'AiNoticeOutdatedError', status: 409, meta: { currentVersion: 1 } }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'The installation has no model credentials (billing.feature_disabled)',
        example: { type: 'billing.feature_disabled', title: 'FeatureDisabledError', status: 503, meta: { feature: 'ai' } }
    })
    public async accept(@Body() body: ConsentRequestDto): Promise<ConsentView> {
        return this.consent.accept(body);
    }

    @Delete()
    @RequiresRole('editor')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Turn the permission off and delete the stored summaries',
        description:
            'Records the revocation and, in the same transaction, deletes what the registered purge ports return (the stored summaries). ' +
            'The log of model calls stays (cost record, no content). Idempotent. Owner and editor only.'
    })
    @ApiNoContentResponse({ description: 'Turned off' })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 403,
        description: 'Only owner and editor may change it (identity.forbidden)',
        example: FORBIDDEN_EXAMPLE
    })
    public async revoke(): Promise<void> {
        await this.consent.revoke();
    }
}
