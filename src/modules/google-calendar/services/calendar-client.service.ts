import { Injectable } from '@nestjs/common';
import { CalendarConnectionDomain } from '../domain/calendar-connection.domain';
import { CalendarNotConnectedError, CalendarProviderUnavailableError, CalendarTokenRevokedError } from '../domain/calendar.errors';
import {
    CONNECTION_STATUSES,
    CalendarAccess,
    CalendarConnection,
    CalendarEvent,
    CalendarRange,
    CalendarSession,
    CreatedCalendarEvent,
    NewCalendarEvent
} from '../domain/calendar.types';
import { CalendarAdapter } from '../ports/calendar.adapter';
import { CalendarAdapterRegistry } from './calendar-adapter.registry';
import { CalendarCredentialsService } from './calendar-credentials.service';
import { CalendarLogService } from './calendar-log.service';
import { CalendarMetricsService } from './calendar-metrics.service';
import { CalendarVaultService } from './calendar-vault.service';

@Injectable()
export class CalendarClientService {
    public constructor(
        private readonly connections: CalendarConnectionDomain,
        private readonly adapters: CalendarAdapterRegistry,
        private readonly credentials: CalendarCredentialsService,
        private readonly vault: CalendarVaultService,
        private readonly logs: CalendarLogService,
        private readonly metrics: CalendarMetricsService
    ) {}

    public async connectionOf(userId: string): Promise<CalendarConnection> {
        const connection: CalendarConnection | null = await this.connections.activeOf(userId);
        if (connection === null) {
            throw new CalendarNotConnectedError();
        }
        return connection;
    }

    public async accessOf(userId: string): Promise<CalendarAccess> {
        const connection: CalendarConnection = await this.connectionOf(userId);
        return this.adapterOf(connection).accessOf(await this.requireSession(connection));
    }

    public async upcoming(userId: string, range: CalendarRange): Promise<CalendarEvent[]> {
        return this.withSession(userId, 'list', async (adapter: CalendarAdapter, session: CalendarSession) =>
            adapter.listUpcoming(session, range)
        );
    }

    public async create(userId: string, event: NewCalendarEvent): Promise<CreatedCalendarEvent> {
        return this.withSession(userId, 'create', async (adapter: CalendarAdapter, session: CalendarSession) =>
            adapter.createEvent(session, event)
        );
    }

    public async disconnect(connection: CalendarConnection): Promise<void> {
        await this.revokeQuietly(connection);
        await this.connections.close(connection.id, CONNECTION_STATUSES.disconnected, new Date());
        this.metrics.connection(CONNECTION_STATUSES.disconnected);
        this.logs.disconnected(1);
    }

    public async disconnectAll(userId?: string): Promise<number> {
        const active: CalendarConnection[] = await this.connections.listActive(userId);
        for (const connection of active) {
            await this.disconnect(connection);
        }
        return active.length;
    }

    public async revokeQuietly(connection: CalendarConnection): Promise<void> {
        const started: number = Date.now();
        try {
            const session: CalendarSession | null = await this.sessionOf(connection);
            if (session !== null) {
                await this.adapterOf(connection).revoke(session);
            }
            this.record('revoke', 'ok', started);
        } catch {
            this.record('revoke', 'error', started);
        }
    }

    private async withSession<T>(
        userId: string,
        operation: string,
        call: (adapter: CalendarAdapter, session: CalendarSession) => Promise<T>
    ): Promise<T> {
        const connection: CalendarConnection = await this.connectionOf(userId);
        const session: CalendarSession = await this.requireSession(connection);
        const started: number = Date.now();
        try {
            const result: T = await call(this.adapterOf(connection), session);
            this.record(operation, 'ok', started);
            return result;
        } catch (error: unknown) {
            return this.failed(error, connection, operation, started);
        }
    }

    private async requireSession(connection: CalendarConnection): Promise<CalendarSession> {
        const session: CalendarSession | null = await this.sessionOf(connection);
        if (session === null) {
            await this.markRevoked(connection);
            throw new CalendarNotConnectedError();
        }
        return session;
    }

    private async failed(error: unknown, connection: CalendarConnection, operation: string, started: number): Promise<never> {
        if (error instanceof CalendarTokenRevokedError) {
            this.record(operation, 'revoked', started);
            await this.markRevoked(connection);
            throw new CalendarNotConnectedError();
        }
        this.record(operation, error instanceof CalendarProviderUnavailableError ? 'unavailable' : 'error', started);
        throw error;
    }

    private async markRevoked(connection: CalendarConnection): Promise<void> {
        if (await this.connections.close(connection.id, CONNECTION_STATUSES.revoked, new Date())) {
            this.logs.revoked();
            this.metrics.connection(CONNECTION_STATUSES.revoked);
        }
    }

    private record(operation: string, outcome: string, started: number): void {
        this.logs.operation(operation, outcome, Date.now() - started);
        this.metrics.api(operation, outcome);
    }

    private adapterOf(connection: CalendarConnection): CalendarAdapter {
        return this.adapters.of(connection.provider as 'google');
    }

    private async sessionOf(connection: CalendarConnection): Promise<CalendarSession | null> {
        const refreshToken: string | null =
            connection.refreshTokenSealed === null ? null : await this.vault.open(connection.refreshTokenSealed);
        return refreshToken === null ? null : { refreshToken, scopes: connection.scopes, credentials: await this.credentials.require() };
    }
}
