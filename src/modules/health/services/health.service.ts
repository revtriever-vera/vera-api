import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';

export interface Readiness {
    readonly status: 'ok' | 'degraded';
    readonly checks: { readonly database: boolean };
}

@Injectable()
export class HealthService {
    public constructor(private readonly database: DatabaseClient) {}

    public async readiness(): Promise<Readiness> {
        const database: boolean = await this.database.isHealthy();
        return { status: database ? 'ok' : 'degraded', checks: { database } };
    }
}
