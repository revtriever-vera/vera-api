import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { CalendarConnectionDomain } from '../domain/calendar-connection.domain';
import { accessFromScopes } from '../domain/calendar-access';
import {
    CONNECTION_STATUSES,
    CalendarConnection,
    CalendarEvent,
    ConnectionView,
    UPCOMING_DAYS,
    UPCOMING_MAX
} from '../domain/calendar.types';
import { CalendarClientService } from '../services/calendar-client.service';
import { CalendarCredentialsService } from '../services/calendar-credentials.service';
import { EventsResponse } from '../validation/calendar.schemas';

const DAY_MS: number = 86_400_000;

@Injectable()
export class CalendarConnectionApplication {
    public constructor(
        private readonly connections: CalendarConnectionDomain,
        private readonly client: CalendarClientService,
        private readonly credentials: CalendarCredentialsService,
        private readonly context: AppContext
    ) {}

    public async view(): Promise<ConnectionView> {
        await this.credentials.require();
        const latest: CalendarConnection | null = await this.connections.latestOf(this.userId());
        if (latest === null || latest.status === CONNECTION_STATUSES.disconnected) {
            return { status: 'none', email: null, connectedAt: null, access: null };
        }
        return {
            status: latest.status === CONNECTION_STATUSES.active ? 'active' : 'revoked',
            email: latest.googleEmail,
            connectedAt: latest.connectedAt.toISOString(),
            access: latest.status === CONNECTION_STATUSES.active ? (accessFromScopes(latest.scopes) ?? 'read_only') : null
        };
    }

    public async events(): Promise<EventsResponse> {
        await this.credentials.require();
        const from: Date = new Date();
        const items: CalendarEvent[] = await this.client.upcoming(this.userId(), {
            from,
            to: new Date(from.getTime() + UPCOMING_DAYS * DAY_MS),
            max: UPCOMING_MAX
        });
        return { items };
    }

    public async disconnect(): Promise<void> {
        const active: CalendarConnection | null = await this.connections.activeOf(this.userId());
        if (active !== null) {
            await this.client.disconnect(active);
        }
    }

    private userId(): string {
        return this.context.get().userId ?? '';
    }
}
