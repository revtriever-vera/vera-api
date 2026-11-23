import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { IdUtil } from '../../../shared/utils/id.util';
import { CalendarConnectionsRepository } from '../repositories/calendar-connections.repository';
import { CALENDAR_PROVIDERS, CONNECTION_STATUSES, CalendarConnection, ConnectionStatus } from './calendar.types';

export interface NewConnection {
    readonly userId: string;
    readonly googleEmail: string;
    readonly sealed: string;
    readonly sealerDriver: string;
    readonly scopes: readonly string[];
}

export interface ReplacedConnection {
    readonly created: CalendarConnection;
    readonly replaced: CalendarConnection | null;
}

@Injectable()
export class CalendarConnectionDomain {
    public constructor(private readonly connections: CalendarConnectionsRepository) {}

    public async activeOf(userId: string): Promise<CalendarConnection | null> {
        return this.connections.findActive(userId);
    }

    public async latestOf(userId: string): Promise<CalendarConnection | null> {
        return this.connections.findLatest(userId);
    }

    public async listActive(userId?: string): Promise<CalendarConnection[]> {
        return this.connections.listActive(userId);
    }

    @UsingTransaction()
    public async replaceActive(input: NewConnection, now: Date): Promise<ReplacedConnection> {
        const previous: CalendarConnection | null = await this.connections.findActive(input.userId);
        if (previous !== null) {
            await this.connections.close(previous.id, CONNECTION_STATUSES.disconnected, now);
        }
        const created: CalendarConnection = await this.connections.create({
            id: IdUtil.newId(),
            userId: input.userId,
            provider: CALENDAR_PROVIDERS.google,
            googleEmail: input.googleEmail,
            refreshTokenSealed: input.sealed,
            sealerDriver: input.sealerDriver,
            scopes: [...input.scopes],
            status: CONNECTION_STATUSES.active,
            connectedAt: now
        });
        return { created, replaced: previous };
    }

    public async listAll(offset: number, limit: number): Promise<CalendarConnection[]> {
        return this.connections.listAll(offset, limit);
    }

    public async close(id: string, status: ConnectionStatus, now: Date): Promise<boolean> {
        return (await this.connections.close(id, status, now)) !== null;
    }

    public async listWithTokens(): Promise<CalendarConnection[]> {
        return this.connections.listWithTokens();
    }

    public async companyIdsWithTokens(): Promise<string[]> {
        return this.connections.companyIdsWithTokens();
    }

    public async replaceSealed(id: string, sealed: string, driver: string): Promise<void> {
        await this.connections.replaceSealed(id, sealed, driver);
    }
}
