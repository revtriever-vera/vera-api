import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AppContext } from '../../../core/context/app-context.port';
import { RecurringRefreshPort } from './recurring-refresh.port';
import { TransactionsLogService } from './transactions-log.service';

@Injectable()
export class TransactionsChangedService {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly context: AppContext,
        private readonly logs: TransactionsLogService
    ) {}

    public async notify(): Promise<void> {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            return;
        }
        for (const port of this.ports()) {
            await this.refresh(port, companyId);
        }
    }

    private async refresh(port: RecurringRefreshPort, companyId: string): Promise<void> {
        try {
            await port.refresh(companyId);
        } catch (error: unknown) {
            this.logs.changeNotificationFailed(error instanceof Error ? error.name : 'unknown');
        }
    }

    private ports(): RecurringRefreshPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is RecurringRefreshPort => instance instanceof RecurringRefreshPort);
    }
}
