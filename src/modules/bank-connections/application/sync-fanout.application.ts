import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { bankConnectionsConfig } from '../config/bank-connections.config';
import { CONNECTION_STATUSES, ConnectionIdentity, StatusCount } from '../domain/bank-connections.types';
import { BankConnectionReaderService } from '../services/bank-connection-reader.service';
import { BankConnectionsLogService } from '../services/bank-connections-log.service';
import { BankConnectionsMetricsService } from '../services/bank-connections-metrics.service';
import { BankSyncPublisherService } from '../services/bank-sync-publisher.service';

const GAUGED_STATUSES: readonly string[] = [
    CONNECTION_STATUSES.active,
    CONNECTION_STATUSES.needsAttention,
    CONNECTION_STATUSES.paused,
    CONNECTION_STATUSES.revoked
];

@Injectable()
export class SyncFanoutApplication {
    public constructor(
        private readonly reader: BankConnectionReaderService,
        private readonly publisher: BankSyncPublisherService,
        private readonly logs: BankConnectionsLogService,
        private readonly metrics: BankConnectionsMetricsService,
        @Inject(bankConnectionsConfig.KEY) private readonly config: ConfigType<typeof bankConnectionsConfig>
    ) {}

    public async handleTick(): Promise<number> {
        const connections: readonly ConnectionIdentity[] = await this.reader.listActiveAcrossTenants();
        await this.publisher.publishDaily(connections, this.config.PLUGGY_SYNC_SPACING_MS);
        await this.refreshGauge();
        this.logs.syncFanout(connections.length);
        return connections.length;
    }

    private async refreshGauge(): Promise<void> {
        const counts: ReadonlyMap<string, number> = new Map<string, number>(
            (await this.reader.countByStatusAcrossTenants()).map((entry: StatusCount): [string, number] => [entry.status, entry.total])
        );
        for (const status of GAUGED_STATUSES) {
            this.metrics.connections(status, counts.get(status) ?? 0);
        }
    }
}
