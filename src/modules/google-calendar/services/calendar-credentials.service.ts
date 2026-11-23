import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { GoogleCredentials, IntegrationCredentialsService } from '../../integration-credentials/services/integration-credentials.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { googleCalendarConfig } from '../config/google-calendar.config';
import { CalendarProviderDisabledError } from '../domain/calendar.errors';
import { ClientCredentials } from '../domain/calendar.types';

const MOCK_CLIENT_ID: string = 'mock-client.apps.googleusercontent.com';
const MOCK_CLIENT_SECRET: string = 'mock-client-secret';

@Injectable()
export class CalendarCredentialsService {
    public constructor(
        private readonly gate: PlanGateService,
        private readonly integrations: IntegrationCredentialsService,
        @Inject(googleCalendarConfig.KEY) private readonly config: ConfigType<typeof googleCalendarConfig>
    ) {}

    public async resolve(): Promise<ClientCredentials | null> {
        if (this.gate.mode() === 'hosted') {
            return this.hosted();
        }
        const credentials: GoogleCredentials | null = await this.integrations.resolve('google');
        return credentials === null
            ? null
            : { clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: this.config.selfHostedRedirectUri };
    }

    public async require(): Promise<ClientCredentials> {
        const credentials: ClientCredentials | null = await this.resolve();
        if (credentials === null) {
            throw new CalendarProviderDisabledError();
        }
        return credentials;
    }

    private hosted(): ClientCredentials | null {
        const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = this.config;
        if (clientId !== undefined && clientSecret !== undefined) {
            return { clientId, clientSecret, redirectUri: this.config.hostedRedirectUri };
        }
        return this.config.GOOGLE_CALENDAR_DRIVER === 'mock'
            ? { clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET, redirectUri: this.config.hostedRedirectUri }
            : null;
    }
}
