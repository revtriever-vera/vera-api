import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { IntegrationsApplication } from '../../application/integrations.application';
import { IntegrationItem, IntegrationKind, IntegrationsView } from '../../domain/integration.types';
import {
    integrationItemSchema,
    integrationKindSchema,
    integrationsViewSchema,
    SaveGoogleBody,
    saveGoogleSchema,
    SaveLlmBody,
    saveLlmSchema,
    SaveWhatsAppBody,
    saveWhatsAppSchema
} from '../../validation/integrations.schemas';
import { SecretSafeValidationPipe } from '../../validation/secret-safe-validation.pipe';

const ONE_HOUR_SECONDS: number = 3600;
const TEST_ATTEMPTS: number = 10;
const NO_STORE: string = 'no-store';
const SECRET_NOTICE: string = 'No route returns a key, token or secret: only the last 4 characters (`hint`).';

const NOT_AVAILABLE_EXAMPLE: Record<string, unknown> = {
    type: 'integrations.not_available',
    title: 'IntegrationsUnavailableError',
    status: 404
};
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'SecretSafeValidationError', status: 400 };
const TEST_FAILED_EXAMPLE: Record<string, unknown> = {
    type: 'integrations.test_failed',
    title: 'IntegrationTestFailedError',
    status: 422,
    meta: { reason: 'unauthorized' }
};
const TOO_MANY_EXAMPLE: Record<string, unknown> = { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 };
const FORBIDDEN_EXAMPLE: Record<string, unknown> = { type: 'identity.forbidden', title: 'ForbiddenError', status: 403 };
const ITEM_EXAMPLE: Record<string, unknown> = {
    kind: 'llm',
    configured: true,
    hint: '…a1b2',
    public: { baseUrl: 'https://llm.example.com/v1', model: 'model-name' },
    verifiedAt: '2026-11-22T12:00:00.000Z'
};

function perCompany(subject: RateLimitSubject): string | null {
    return subject.companyId ?? null;
}

const testLimit = (key: string): MethodDecorator =>
    RateLimit({ key, limit: TEST_ATTEMPTS, windowSeconds: ONE_HOUR_SECONDS, identify: perCompany });

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('owner')
@Controller('integrations')
export class IntegrationsController {
    public constructor(private readonly integrations: IntegrationsApplication) {}

    @Get()
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'List the integrations of a self-hosted installation',
        description: `Whether each integration has a key saved, plus the URLs to register in the provider consoles. ${SECRET_NOTICE}`
    })
    @ApiZodResponse({
        status: 200,
        description: 'Integrations state',
        schema: integrationsViewSchema,
        example: {
            items: [ITEM_EXAMPLE],
            webhookUrl: 'https://vera.example.com/api/whatsapp',
            googleRedirectUri: 'https://vera.example.com/api/google/callback'
        }
    })
    @ApiProblemResponse({ status: 403, description: 'Only the owner (identity.forbidden)', example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: 'Hosted deployment: the installation owns the keys', example: NOT_AVAILABLE_EXAMPLE })
    public async list(): Promise<IntegrationsView> {
        return this.integrations.list();
    }

    @Put('llm')
    @Header('Cache-Control', NO_STORE)
    @testLimit('integrations-llm-test')
    @ApiOperation({
        summary: 'Save and test the language model key',
        description: `Calls the provider with the key first and saves it sealed only when the test passes. ${SECRET_NOTICE}`
    })
    @ApiZodBody(saveLlmSchema)
    @ApiZodResponse({ status: 200, description: 'Integration saved', schema: integrationItemSchema, example: ITEM_EXAMPLE })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (only the field path and the rule are reported)',
        example: INVALID_EXAMPLE
    })
    @ApiProblemResponse({ status: 404, description: 'Hosted deployment', example: NOT_AVAILABLE_EXAMPLE })
    @ApiProblemResponse({
        status: 422,
        description: 'The provider test failed (`meta.reason`). Nothing was saved',
        example: TEST_FAILED_EXAMPLE
    })
    @ApiProblemResponse({ status: 429, description: 'More than 10 tests in 1 hour for the company', example: TOO_MANY_EXAMPLE })
    public async saveLlm(@Body(new SecretSafeValidationPipe(saveLlmSchema)) body: SaveLlmBody): Promise<IntegrationItem> {
        return this.integrations.saveLlm(body);
    }

    @Put('whatsapp')
    @Header('Cache-Control', NO_STORE)
    @testLimit('integrations-whatsapp-test')
    @ApiOperation({
        summary: 'Save and test the WhatsApp Cloud API key',
        description: `Reads the phone number from the Graph API with the token first and saves it sealed only when the test passes. ${SECRET_NOTICE}`
    })
    @ApiZodBody(saveWhatsAppSchema)
    @ApiZodResponse({
        status: 200,
        description: 'Integration saved',
        schema: integrationItemSchema,
        example: {
            kind: 'whatsapp',
            configured: true,
            hint: '…c3d4',
            public: { phoneNumberId: '104857600000000' },
            verifiedAt: '2026-11-22T12:00:00.000Z'
        }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (only the field path and the rule are reported)',
        example: INVALID_EXAMPLE
    })
    @ApiProblemResponse({ status: 404, description: 'Hosted deployment', example: NOT_AVAILABLE_EXAMPLE })
    @ApiProblemResponse({
        status: 409,
        description: 'The number is linked to another account (integrations.phone_in_use)',
        example: { type: 'integrations.phone_in_use', title: 'PhoneNumberInUseError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The provider test failed (`meta.reason`). Nothing was saved',
        example: TEST_FAILED_EXAMPLE
    })
    @ApiProblemResponse({ status: 429, description: 'More than 10 tests in 1 hour for the company', example: TOO_MANY_EXAMPLE })
    public async saveWhatsApp(@Body(new SecretSafeValidationPipe(saveWhatsAppSchema)) body: SaveWhatsAppBody): Promise<IntegrationItem> {
        return this.integrations.saveWhatsApp(body);
    }

    @Put('google')
    @Header('Cache-Control', NO_STORE)
    @testLimit('integrations-google-test')
    @ApiOperation({
        summary: 'Save the Google OAuth client',
        description:
            'Validates the client ID format and saves the pair sealed. Google only checks the secret when the code is exchanged, so the ' +
            `real test is the first connection of Google Agenda. ${SECRET_NOTICE}`
    })
    @ApiZodBody(saveGoogleSchema)
    @ApiZodResponse({
        status: 200,
        description: 'Integration saved',
        schema: integrationItemSchema,
        example: {
            kind: 'google',
            configured: true,
            hint: '…e5f6',
            public: { clientId: '123-abc.apps.googleusercontent.com' },
            verifiedAt: '2026-11-22T12:00:00.000Z'
        }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (only the field path and the rule are reported)',
        example: INVALID_EXAMPLE
    })
    @ApiProblemResponse({ status: 404, description: 'Hosted deployment', example: NOT_AVAILABLE_EXAMPLE })
    @ApiProblemResponse({ status: 429, description: 'More than 10 attempts in 1 hour for the company', example: TOO_MANY_EXAMPLE })
    public async saveGoogle(@Body(new SecretSafeValidationPipe(saveGoogleSchema)) body: SaveGoogleBody): Promise<IntegrationItem> {
        return this.integrations.saveGoogle(body);
    }

    @Delete(':kind')
    @Header('Cache-Control', NO_STORE)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Remove an integration key',
        description:
            'Hard deletes the sealed key. The feature becomes disabled at once; removing WhatsApp unlinks the number and cancels reminders, ' +
            'removing Google disconnects the calendar.'
    })
    @ApiNoContentResponse({ description: 'Integration removed' })
    @ApiProblemResponse({ status: 400, description: 'Unknown kind', example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: 'Hosted deployment', example: NOT_AVAILABLE_EXAMPLE })
    public async remove(@Param('kind', new SecretSafeValidationPipe(integrationKindSchema)) kind: IntegrationKind): Promise<void> {
        await this.integrations.remove(kind);
    }
}
