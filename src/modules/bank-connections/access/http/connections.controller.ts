import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { ConnectionsApplication, ConnectionsOverview } from '../../application/connections.application';
import { ItemResultView } from '../../domain/bank-connections.types';
import {
    ConnectionIdParamsDto,
    ConnectItemsBody,
    connectItemsResponseSchema,
    connectItemsSchema,
    connectionsOverviewSchema,
    PurgeQueryDto,
    purgeQuerySchema
} from '../../validation/bank-connections.schemas';
import { SecretSafeValidationPipe } from '../../validation/secret-safe-validation.pipe';

const TEN_MINUTES_SECONDS: number = 600;
const CONNECT_ATTEMPTS: number = 10;
const NO_STORE: string = 'no-store';
const CONNECTION_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Bank connection id' };

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };

const CONNECTION_EXAMPLE: Record<string, unknown> = {
    id: '0199c3a0-3333-7c52-9d0e-3f6a1b2c4d5e',
    itemIdHint: '00000000…a001',
    connectorName: 'Nubank',
    status: 'active',
    statusReason: null,
    consentExpiresAt: '2027-01-09T12:00:00.000Z',
    lastSyncAt: '2026-10-11T12:00:00.000Z',
    lastSuccessAt: '2026-10-11T12:00:00.000Z',
    syncing: false,
    accounts: [{ accountId: '0199c3a0-2222-7c52-9d0e-3f6a1b2c4d5e', name: 'Nubank Cartão', kind: 'credit_card', numberLast4: '4321' }],
    lastRun: {
        trigger: 'daily',
        status: 'succeeded',
        startedAt: '2026-10-11T12:00:00.000Z',
        finishedAt: '2026-10-11T12:00:04.000Z',
        inserted: 12,
        failureCode: null
    }
};

function perCompany(subject: RateLimitSubject): string | null {
    return subject.companyId ?? null;
}

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/connections')
export class ConnectionsController {
    public constructor(private readonly connections: ConnectionsApplication) {}

    @Get()
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'List the credentials state and the bank connections',
        description:
            'Reads only the database, never Pluggy. Each connection carries its status, the linked accounts and the last synchronization ' +
            'run. The Client Secret, the full Client ID and the full Item IDs are never returned.'
    })
    @ApiZodResponse({
        status: 200,
        description: 'Credentials state and connections',
        schema: connectionsOverviewSchema,
        example: {
            credentials: {
                configured: true,
                clientIdHint: '3f9a…c2e1',
                status: 'valid',
                lastVerifiedAt: '2026-10-11T12:00:00.000Z',
                updatedAt: '2026-10-11T12:00:00.000Z'
            },
            connections: [CONNECTION_EXAMPLE]
        }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async overview(): Promise<ConnectionsOverview> {
        return this.connections.overview();
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    @Header('Cache-Control', NO_STORE)
    @RateLimit({ key: 'pluggy-connections-connect', limit: CONNECT_ATTEMPTS, windowSeconds: TEN_MINUTES_SECONDS, identify: perCompany })
    @ApiOperation({
        summary: 'Connect banks from their Pluggy Item IDs',
        description:
            'Checks each Item ID against Pluggy with the saved credentials and creates a connection for each one found, then queues the ' +
            'first synchronization. The answer is 200 even when only some items succeed: each entry reports its own outcome ' +
            '(connected, already_connected, not_found, limit_reached or failed), in the order sent. Repeated ids are collapsed.'
    })
    @ApiZodBody(connectItemsSchema)
    @ApiZodResponse({
        status: 200,
        description: 'One result per distinct Item ID',
        schema: connectItemsResponseSchema,
        example: {
            results: [
                { itemIdHint: '00000000…a001', outcome: 'connected', connection: CONNECTION_EXAMPLE },
                { itemIdHint: '00000000…a404', outcome: 'not_found', connection: null }
            ]
        }
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
    @ApiProblemResponse({
        status: 422,
        description:
            'No usable credentials: none saved (connections.credentials_missing) or Pluggy rejected them (connections.invalid_credentials)',
        example: { type: 'connections.credentials_missing', title: 'CredentialsMissingError', status: 422 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 10 attempts in 10 minutes for the company',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    @ApiProblemResponse({
        status: 502,
        description: 'Pluggy is unavailable for the authentication (connections.provider_unavailable)',
        example: { type: 'connections.provider_unavailable', title: 'PluggyProviderUnavailableError', status: 502 }
    })
    public async connect(
        @Body(new SecretSafeValidationPipe(connectItemsSchema)) body: ConnectItemsBody
    ): Promise<{ results: ItemResultView[] }> {
        return this.connections.connect(body.itemIds);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Disconnect a bank',
        description:
            'Marks the connection as disconnected and soft deletes it. The imported accounts and transactions stay unless ' +
            '`purgeTransactions=true`, which also soft deletes the accounts of the connection and their transactions.'
    })
    @ApiParam(CONNECTION_ID_PARAM)
    @ApiZodQuery(purgeQuerySchema)
    @ApiNoContentResponse({ description: 'Connection removed' })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 404,
        description: 'The connection does not exist in this company (connections.connection_not_found)',
        example: { type: 'connections.connection_not_found', title: 'ConnectionNotFoundError', status: 404 }
    })
    public async disconnect(@Param() params: ConnectionIdParamsDto, @Query() query: PurgeQueryDto): Promise<void> {
        await this.connections.disconnect(params.id, query.purgeTransactions === 'true');
    }
}
