import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { CredentialsApplication } from '../../application/credentials.application';
import { CredentialsView } from '../../domain/bank-connections.types';
import {
    credentialsViewSchema,
    PurgeQueryDto,
    purgeQuerySchema,
    SaveCredentialsBody,
    saveCredentialsSchema
} from '../../validation/bank-connections.schemas';
import { SecretSafeValidationPipe } from '../../validation/secret-safe-validation.pipe';

const TEN_MINUTES_SECONDS: number = 600;
const SAVE_ATTEMPTS: number = 5;
const TEST_ATTEMPTS: number = 10;
const NO_STORE: string = 'no-store';
const SECRET_NOTICE: string = 'The Client Secret and the full Client ID are never returned by any route.';

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'SecretSafeValidationError', status: 400 };
const TOO_MANY_EXAMPLE: Record<string, unknown> = { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 };
const MISSING_EXAMPLE: Record<string, unknown> = { type: 'connections.credentials_missing', title: 'CredentialsMissingError', status: 422 };
const UNAVAILABLE_EXAMPLE: Record<string, unknown> = {
    type: 'connections.provider_unavailable',
    title: 'PluggyProviderUnavailableError',
    status: 502
};
const CREDENTIALS_EXAMPLE: Record<string, unknown> = {
    configured: true,
    clientIdHint: '3f9a…c2e1',
    status: 'valid',
    lastVerifiedAt: '2026-10-11T12:00:00.000Z',
    updatedAt: '2026-10-11T12:00:00.000Z'
};

function perCompany(subject: RateLimitSubject): string | null {
    return subject.companyId ?? null;
}

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/connections/credentials')
export class CredentialsController {
    public constructor(private readonly credentials: CredentialsApplication) {}

    @Get()
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Show the state of the Pluggy credentials',
        description: `Whether the company has credentials saved, the masked Client ID and the result of the last test. ${SECRET_NOTICE}`
    })
    @ApiZodResponse({ status: 200, description: 'Credentials state', schema: credentialsViewSchema, example: CREDENTIALS_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async get(): Promise<CredentialsView> {
        return this.credentials.get();
    }

    @Put()
    @Header('Cache-Control', NO_STORE)
    @RateLimit({ key: 'pluggy-credentials-save', limit: SAVE_ATTEMPTS, windowSeconds: TEN_MINUTES_SECONDS, identify: perCompany })
    @ApiOperation({
        summary: 'Save or replace the Pluggy credentials',
        description:
            'Tests the credentials against Pluggy first and saves them sealed only when the test passes. The same route creates and ' +
            'rotates: the previous credentials are hard deleted so a replaced secret is not kept, and connections paused because of ' +
            `invalid credentials are resumed and queued for a synchronization. ${SECRET_NOTICE} The error body never repeats what was sent.`
    })
    @ApiZodBody(saveCredentialsSchema)
    @ApiZodResponse({ status: 200, description: 'Credentials saved', schema: credentialsViewSchema, example: CREDENTIALS_EXAMPLE })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (only the field path and the rule are reported)',
        example: INVALID_EXAMPLE
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 422,
        description: 'Pluggy rejected the credentials (connections.invalid_credentials). Nothing was saved',
        example: { type: 'connections.invalid_credentials', title: 'InvalidPluggyCredentialsError', status: 422 }
    })
    @ApiProblemResponse({ status: 429, description: 'More than 5 attempts in 10 minutes for the company', example: TOO_MANY_EXAMPLE })
    @ApiProblemResponse({
        status: 502,
        description: 'Pluggy is unavailable (connections.provider_unavailable). Nothing was saved',
        example: UNAVAILABLE_EXAMPLE
    })
    public async save(@Body(new SecretSafeValidationPipe(saveCredentialsSchema)) body: SaveCredentialsBody): Promise<CredentialsView> {
        return this.credentials.save(body);
    }

    @Post('test')
    @HttpCode(HttpStatus.OK)
    @Header('Cache-Control', NO_STORE)
    @RateLimit({ key: 'pluggy-credentials-test', limit: TEST_ATTEMPTS, windowSeconds: TEN_MINUTES_SECONDS, identify: perCompany })
    @ApiOperation({
        summary: 'Test the saved Pluggy credentials again',
        description:
            'Authenticates with the saved credentials. On success the status becomes valid; when Pluggy answers 401 the status becomes ' +
            `invalid and the route still answers 200. ${SECRET_NOTICE}`
    })
    @ApiZodResponse({
        status: 200,
        description: 'Credentials state after the test',
        schema: credentialsViewSchema,
        example: CREDENTIALS_EXAMPLE
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({ status: 422, description: 'No credentials saved (connections.credentials_missing)', example: MISSING_EXAMPLE })
    @ApiProblemResponse({ status: 429, description: 'More than 10 tests in 10 minutes for the company', example: TOO_MANY_EXAMPLE })
    @ApiProblemResponse({
        status: 502,
        description: 'Pluggy is unavailable (connections.provider_unavailable)',
        example: UNAVAILABLE_EXAMPLE
    })
    public async test(): Promise<CredentialsView> {
        return this.credentials.test();
    }

    @Delete()
    @HttpCode(HttpStatus.NO_CONTENT)
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Remove the Pluggy credentials',
        description:
            'Hard deletes the sealed credentials and disconnects every bank connection. The imported accounts and transactions stay ' +
            'unless `purgeTransactions=true`, which also soft deletes the accounts that came from the connections and their transactions.'
    })
    @ApiZodQuery(purgeQuerySchema)
    @ApiNoContentResponse({ description: 'Credentials removed' })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async remove(@Query() query: PurgeQueryDto): Promise<void> {
        await this.credentials.remove(query.purgeTransactions === 'true');
    }
}
