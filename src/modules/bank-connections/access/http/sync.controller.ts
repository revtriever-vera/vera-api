import { Controller, Header, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { ManualSyncApplication } from '../../application/manual-sync.application';
import { ConnectionIdParamsDto, syncAllQueuedSchema, syncQueuedSchema } from '../../validation/bank-connections.schemas';

const TEN_MINUTES_SECONDS: number = 600;
const SYNC_ONE_ATTEMPTS: number = 3;
const SYNC_ALL_ATTEMPTS: number = 2;
const NO_STORE: string = 'no-store';
const CONNECTION_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Bank connection id' };

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const TOO_MANY_EXAMPLE: Record<string, unknown> = { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 };
const MISSING_EXAMPLE: Record<string, unknown> = { type: 'connections.credentials_missing', title: 'CredentialsMissingError', status: 422 };

function perCompany(subject: RateLimitSubject): string | null {
    return subject.companyId ?? null;
}

function perCompanyAndConnection(subject: RateLimitSubject): string | null {
    return subject.companyId === undefined ? null : `${subject.companyId}:${subject.params['id'] ?? ''}`;
}

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/connections')
export class SyncController {
    public constructor(private readonly sync: ManualSyncApplication) {}

    @Post('sync')
    @HttpCode(HttpStatus.ACCEPTED)
    @Header('Cache-Control', NO_STORE)
    @RateLimit({ key: 'pluggy-sync-all', limit: SYNC_ALL_ATTEMPTS, windowSeconds: TEN_MINUTES_SECONDS, identify: perCompany })
    @ApiOperation({
        summary: 'Synchronize every bank connection now',
        description:
            'Queues one synchronization for each connection of the company that can be synchronized (active or needing attention). ' +
            'Connections that are already syncing are left out. Poll `GET /spending/connections` while `syncing` is true.'
    })
    @ApiZodResponse({ status: 202, description: 'Synchronizations queued', schema: syncAllQueuedSchema, example: { queued: 2 } })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 422,
        description:
            'No usable credentials: none saved (connections.credentials_missing) or Pluggy rejected them (connections.invalid_credentials)',
        example: MISSING_EXAMPLE
    })
    @ApiProblemResponse({
        status: 503,
        description: 'No synchronization could be queued (connections.sync_unavailable)',
        example: { type: 'connections.sync_unavailable', title: 'SyncQueueUnavailableError', status: 503 }
    })
    @ApiProblemResponse({ status: 429, description: 'More than 2 requests in 10 minutes for the company', example: TOO_MANY_EXAMPLE })
    public async syncAll(): Promise<{ queued: number }> {
        return this.sync.syncAll();
    }

    @Post(':id/sync')
    @HttpCode(HttpStatus.ACCEPTED)
    @Header('Cache-Control', NO_STORE)
    @RateLimit({ key: 'pluggy-sync-one', limit: SYNC_ONE_ATTEMPTS, windowSeconds: TEN_MINUTES_SECONDS, identify: perCompanyAndConnection })
    @ApiOperation({
        summary: 'Synchronize one bank connection now',
        description:
            'Queues a synchronization for the connection. The answer only says it was queued: poll `GET /spending/connections` while ' +
            '`syncing` is true to follow it.'
    })
    @ApiParam(CONNECTION_ID_PARAM)
    @ApiZodResponse({ status: 202, description: 'Synchronization queued', schema: syncQueuedSchema, example: { queued: true } })
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
    @ApiProblemResponse({
        status: 409,
        description:
            'A synchronization of this connection started less than 15 minutes ago and is still running (connections.sync_in_progress)',
        example: { type: 'connections.sync_in_progress', title: 'SyncInProgressError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description:
            'The item was revoked at Pluggy (connections.item_not_found) or there are no usable credentials (connections.credentials_missing, connections.invalid_credentials)',
        example: { type: 'connections.item_not_found', title: 'ItemNotFoundError', status: 422 }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'The synchronization could not be queued (connections.sync_unavailable)',
        example: { type: 'connections.sync_unavailable', title: 'SyncQueueUnavailableError', status: 503 }
    })
    @ApiProblemResponse({ status: 429, description: 'More than 3 requests in 10 minutes for the connection', example: TOO_MANY_EXAMPLE })
    public async syncOne(@Param() params: ConnectionIdParamsDto): Promise<{ queued: true }> {
        return this.sync.syncOne(params.id);
    }
}
