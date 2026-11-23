import { Injectable } from '@nestjs/common';
import { CalendarConnectionDomain, ReplacedConnection } from '../domain/calendar-connection.domain';
import { accessFromScopes } from '../domain/calendar-access';
import { CalendarCallbackError, CalendarProviderUnavailableError, CalendarTokenRevokedError } from '../domain/calendar.errors';
import { CALLBACK_ERRORS, CONNECTION_STATUSES, CalendarAccess, CalendarGrant, ClientCredentials } from '../domain/calendar.types';
import { OAuthStatePayload } from '../domain/oauth-state';
import { CalendarAdapterRegistry } from './calendar-adapter.registry';
import { CalendarClientService } from './calendar-client.service';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarLogService } from './calendar-log.service';
import { CalendarMetricsService } from './calendar-metrics.service';
import { CalendarVaultService, SealedToken } from './calendar-vault.service';

@Injectable()
export class CalendarEnrollmentService {
    public constructor(
        private readonly adapters: CalendarAdapterRegistry,
        private readonly credentials: CalendarCredentialsService,
        private readonly vault: CalendarVaultService,
        private readonly connections: CalendarConnectionDomain,
        private readonly client: CalendarClientService,
        private readonly logs: CalendarLogService,
        private readonly metrics: CalendarMetricsService
    ) {}

    public async enroll(payload: OAuthStatePayload, code: string, codeVerifier: string, now: Date): Promise<void> {
        const grant: CalendarGrant = await this.exchange(code, codeVerifier);
        const access: CalendarAccess | null = accessFromScopes(grant.scopes);
        if (access === null) {
            this.logs.scopeMissing();
            throw new CalendarCallbackError(CALLBACK_ERRORS.scopeMissing);
        }
        if (grant.refreshToken === null) {
            throw new CalendarProviderUnavailableError();
        }
        await this.store(payload, grant, grant.refreshToken, now);
        this.logs.connected(access);
        this.metrics.connection(CONNECTION_STATUSES.active);
    }

    private async store(payload: OAuthStatePayload, grant: CalendarGrant, refreshToken: string, now: Date): Promise<void> {
        const sealed: SealedToken = await this.vault.seal(refreshToken);
        const result: ReplacedConnection = await this.connections.replaceActive(
            {
                userId: payload.userId,
                googleEmail: grant.email ?? payload.hint ?? '',
                sealed: sealed.sealed,
                sealerDriver: sealed.sealerDriver,
                scopes: grant.scopes
            },
            now
        );
        if (result.replaced !== null) {
            await this.client.revokeQuietly(result.replaced);
        }
    }

    private async exchange(code: string, codeVerifier: string): Promise<CalendarGrant> {
        const credentials: ClientCredentials = await this.credentials.require();
        try {
            return await this.adapters.of('google').exchangeCode({ credentials, code, codeVerifier });
        } catch (error: unknown) {
            if (error instanceof CalendarTokenRevokedError) {
                throw new CalendarCallbackError(CALLBACK_ERRORS.stateInvalid);
            }
            throw error;
        }
    }
}
