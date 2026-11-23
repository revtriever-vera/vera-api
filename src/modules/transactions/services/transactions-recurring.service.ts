import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { RecurringMarkPort } from './recurring-mark.port';
import { TransactionsLogService } from './transactions-log.service';

@Injectable()
export class TransactionsRecurringService {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly logs: TransactionsLogService
    ) {}

    public async markedIn(transactionIds: readonly string[]): Promise<ReadonlySet<string>> {
        if (transactionIds.length === 0) {
            return new Set<string>();
        }
        const answers: ReadonlySet<string>[] = await Promise.all(
            this.ports().map((port: RecurringMarkPort): Promise<ReadonlySet<string>> => this.askOne(port, transactionIds))
        );
        return new Set<string>(answers.flatMap((answer: ReadonlySet<string>): string[] => [...answer]));
    }

    private async askOne(port: RecurringMarkPort, transactionIds: readonly string[]): Promise<ReadonlySet<string>> {
        try {
            return await port.confirmedTransactionIds(transactionIds);
        } catch (error: unknown) {
            this.logs.recurringMarkFailed(error instanceof Error ? error.name : 'unknown');
            return new Set<string>();
        }
    }

    private ports(): RecurringMarkPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is RecurringMarkPort => instance instanceof RecurringMarkPort);
    }
}
