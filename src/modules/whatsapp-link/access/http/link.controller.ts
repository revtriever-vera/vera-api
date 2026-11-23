import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { PremiumGuard } from '../../../plans/services/premium.guard';
import { RequiresFeature } from '../../../plans/services/requires-feature.decorator';
import { LinkCodeApplication } from '../../application/link-code.application';
import { UnlinkApplication } from '../../application/unlink.application';
import { CODE_REQUESTS_PER_COMPANY_PER_DAY, ONE_DAY_SECONDS } from '../../domain/whatsapp-link.types';
import {
    IssueCodeRequestDto,
    IssuedCode,
    LinkView,
    issueCodeRequestSchema,
    issuedCodeSchema,
    linkViewSchema
} from '../../validation/link.schemas';

const NO_STORE: string = 'no-store';

const VIEW_EXAMPLE: LinkView = {
    status: 'active',
    phone: '+5511999990001',
    linkedAt: '2026-11-22T12:00:00.000Z',
    veraNumber: '551140000000',
    pending: null,
    lastUnlinkReason: null,
    consentRequired: false
};

const CODE_EXAMPLE: IssuedCode = {
    code: 'K7M2QX9D',
    waLink: 'https://wa.me/551140000000?text=VINCULAR%20K7M2QX9D',
    expiresAt: '2026-11-22T12:10:00.000Z'
};

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const DISABLED_EXAMPLE: Record<string, unknown> = {
    type: 'whatsapp.provider_disabled',
    title: 'WhatsAppProviderDisabledError',
    status: 503
};

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('viewer')
@Controller('whatsapp/link')
export class LinkController {
    public constructor(
        private readonly codes: LinkCodeApplication,
        private readonly unlinking: UnlinkApplication
    ) {}

    @Get()
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'State of the signed-in person WhatsApp link',
        description:
            'Returns none, pending (a code was issued and has not been used), active or suspended, the full number only for the person ' +
            'who linked it, the number to write to and why the last link ended. The code and its link are only returned when issued.'
    })
    @ApiZodResponse({ status: 200, description: 'Link state', schema: linkViewSchema, example: VIEW_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({ status: 503, description: 'WhatsApp is not configured (whatsapp.provider_disabled)', example: DISABLED_EXAMPLE })
    public async get(): Promise<LinkView> {
        return this.codes.view();
    }

    @Post('code')
    @HttpCode(HttpStatus.OK)
    @RequiresFeature('whatsapp')
    @UseGuards(PremiumGuard)
    @RateLimit({
        key: 'whatsapp-link-code-company',
        limit: CODE_REQUESTS_PER_COMPANY_PER_DAY,
        windowSeconds: ONE_DAY_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Generate the code the person sends from their WhatsApp to link the number',
        description:
            'Issues an eight character single-use code valid for ten minutes (only its hash is stored); a new code cancels the previous ' +
            'one. When the account has not allowed sending aggregated figures to a language model, `consent: true` is required and ' +
            'turns the permission on. Nothing is sent through WhatsApp in this step. Limits: five codes per person per hour and ' +
            'twenty per account per day.'
    })
    @ApiZodBody(issueCodeRequestSchema)
    @ApiZodResponse({ status: 200, description: 'Code and wa.me link', schema: issuedCodeSchema, example: CODE_EXAMPLE })
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
        example: { type: 'billing.premium_required', title: 'PremiumRequiredError', status: 402, meta: { feature: 'whatsapp' } }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'The person already has a linked number (whatsapp.already_linked)',
        example: { type: 'whatsapp.already_linked', title: 'WhatsAppAlreadyLinkedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The account has not allowed the language model and consent was not sent (whatsapp.consent_required)',
        example: { type: 'whatsapp.consent_required', title: 'WhatsAppConsentRequiredError', status: 422 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many codes requested (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    @ApiProblemResponse({ status: 503, description: 'WhatsApp is not configured (whatsapp.provider_disabled)', example: DISABLED_EXAMPLE })
    public async issue(@Body() body: IssueCodeRequestDto): Promise<IssuedCode> {
        return this.codes.issue(body);
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Unlink the signed-in person number',
        description:
            'Ends the link, cancels the reminders created through it and deletes the conversation text. Also cancels a pending code. ' +
            'Idempotent: without a link it still answers 204.'
    })
    @ApiNoContentResponse({ description: 'Unlinked' })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async unlink(): Promise<void> {
        await this.unlinking.unlink();
    }
}
