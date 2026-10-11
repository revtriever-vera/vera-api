import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { CredentialAction } from '../domain/bank-connections.types';
import { ProviderEndpoint } from './bank-connections-log.service';

const REQUESTS_TOTAL: string = 'vera_pluggy_requests_total';
const CREDENTIALS_TOTAL: string = 'vera_pluggy_credentials_total';
const HTTP_OK_FLOOR: number = 200;
const HTTP_REDIRECT_FLOOR: number = 300;
const HTTP_CLIENT_ERROR_FLOOR: number = 400;
const HTTP_SERVER_ERROR_FLOOR: number = 500;
const HTTP_TOO_MANY_REQUESTS: number = 429;

export type CredentialResult = 'ok' | 'rejected' | 'unavailable';

export function statusClassOf(status: number | null): string {
    if (status === null) {
        return 'network';
    }
    if (status === HTTP_TOO_MANY_REQUESTS) {
        return '429';
    }
    if (status >= HTTP_SERVER_ERROR_FLOOR) {
        return '5xx';
    }
    if (status >= HTTP_CLIENT_ERROR_FLOOR) {
        return '4xx';
    }
    return status >= HTTP_OK_FLOOR && status < HTTP_REDIRECT_FLOOR ? '2xx' : 'other';
}

@Injectable()
export class BankConnectionsMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public providerRequest(endpoint: ProviderEndpoint, status: number | null): void {
        this.metrics.count(REQUESTS_TOTAL, { endpoint, status: statusClassOf(status) });
    }

    public credentials(action: CredentialAction, result: CredentialResult): void {
        this.metrics.count(CREDENTIALS_TOTAL, { action, result });
    }
}
