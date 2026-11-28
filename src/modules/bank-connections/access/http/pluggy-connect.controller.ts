import { Body, Controller, Header, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { PluggyConnectApplication } from '../../application/pluggy-connect.application';
import { ConnectTokenView, ItemResultView } from '../../domain/bank-connections.types';
import {
    ConnectResultBody,
    connectItemsResponseSchema,
    connectResultSchema,
    connectTokenResponseSchema
} from '../../validation/bank-connections.schemas';
import { SecretSafeValidationPipe } from '../../validation/secret-safe-validation.pipe';

const TEN_MINUTES_SECONDS: number = 600;
const TOKEN_ATTEMPTS: number = 10;
const RESULT_ATTEMPTS: number = 10;
const NO_STORE: string = 'no-store';

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const TOO_MANY_EXAMPLE: Record<string, unknown> = { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 };
const UNUSABLE_EXAMPLE: Record<string, unknown> = {
    type: 'connections.credentials_missing',
    title: 'CredentialsMissingError',
    status: 422
};
const UNUSABLE_DESCRIPTION: string =
    'No usable credentials: none saved (connections.credentials_missing) or Pluggy rejected them (connections.invalid_credentials)';
const UNAVAILABLE_EXAMPLE: Record<string, unknown> = {
    type: 'connections.provider_unavailable',
    title: 'PluggyProviderUnavailableError',
    status: 502
};

function perCompany(subject: RateLimitSubject): string | null {
    return subject.companyId ?? null;
}

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiresRole('editor')
@Controller('spending/connections')
export class PluggyConnectController {
    public constructor(private readonly pluggyConnect: PluggyConnectApplication) {}

    @Post('connect-token')
    @HttpCode(HttpStatus.OK)
    @Header('Cache-Control', NO_STORE)
    @RateLimit({ key: 'pluggy-connect-token', limit: TOKEN_ATTEMPTS, windowSeconds: TEN_MINUTES_SECONDS, identify: perCompany })
    @ApiOperation({
        summary: 'Create a Pluggy Connect token with the saved credentials',
        description:
            "Authenticates with the company's own Pluggy credentials and asks Pluggy for a connect token for the Connect widget, with " +
            'the company as `clientUserId` and `avoidDuplicates`. When the public webhook URL is configured, the token also carries the ' +
            'signed `webhookUrl` of the company, so Pluggy reports `item/created` to the API. The Client Secret is never returned.'
    })
    @ApiZodResponse({
        status: 200,
        description: 'Connect token for the widget',
        schema: connectTokenResponseSchema,
        example: { accessToken: '<connect-token>', expiresAt: '2026-11-28T12:30:00.000Z', webhookEnabled: true }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({ status: 422, description: UNUSABLE_DESCRIPTION, example: UNUSABLE_EXAMPLE })
    @ApiProblemResponse({ status: 429, description: 'More than 10 tokens in 10 minutes for the company', example: TOO_MANY_EXAMPLE })
    @ApiProblemResponse({
        status: 502,
        description: 'Pluggy is unavailable (connections.provider_unavailable)',
        example: UNAVAILABLE_EXAMPLE
    })
    public async connectToken(): Promise<ConnectTokenView> {
        return this.pluggyConnect.connectToken();
    }

    @Post('connect-result')
    @HttpCode(HttpStatus.OK)
    @Header('Cache-Control', NO_STORE)
    @RateLimit({ key: 'pluggy-connect-result', limit: RESULT_ATTEMPTS, windowSeconds: TEN_MINUTES_SECONDS, identify: perCompany })
    @ApiOperation({
        summary: 'Register the items returned by the Pluggy Connect widget',
        description:
            'Receives the Item IDs of the widget `onSuccess` and registers them the same way as a pasted Item ID: each one is checked ' +
            'against Pluggy with the saved credentials, a connection is created and the first synchronization is queued. Idempotent: an ' +
            'item already registered (by an earlier call or by the `item/created` webhook) answers `already_connected` and is not duplicated.'
    })
    @ApiZodBody(connectResultSchema)
    @ApiZodResponse({
        status: 200,
        description: 'One result per distinct Item ID',
        schema: connectItemsResponseSchema,
        example: { results: [{ itemIdHint: '00000000…a001', outcome: 'already_connected', connection: null }] }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (only the field path and the rule are reported)',
        example: { type: 'validation_failed', title: 'SecretSafeValidationError', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({ status: 422, description: UNUSABLE_DESCRIPTION, example: UNUSABLE_EXAMPLE })
    @ApiProblemResponse({ status: 429, description: 'More than 10 attempts in 10 minutes for the company', example: TOO_MANY_EXAMPLE })
    @ApiProblemResponse({
        status: 502,
        description: 'Pluggy is unavailable for the authentication (connections.provider_unavailable)',
        example: UNAVAILABLE_EXAMPLE
    })
    public async connectResult(
        @Body(new SecretSafeValidationPipe(connectResultSchema)) body: ConnectResultBody
    ): Promise<{ results: ItemResultView[] }> {
        return this.pluggyConnect.connectResult(body.itemIds);
    }
}
