import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { IngestionResult, TransactionSource } from '../domain/transactions.types';

const INGESTED_TOTAL: string = 'vera_transactions_ingested_total';
const RECATEGORIZED_TOTAL: string = 'vera_transactions_recategorized_total';

export type RecategorizationOrigin = 'manual' | 'rule';

@Injectable()
export class TransactionsMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public ingested(source: TransactionSource, result: IngestionResult): void {
        this.count(source, 'inserted', result.inserted);
        this.count(source, 'updated', result.updated);
        this.count(source, 'duplicate', result.duplicates);
        this.count(source, 'superseded', result.superseded);
        this.count(source, 'rejected', result.rejected);
    }

    public recategorized(origin: RecategorizationOrigin, amount: number): void {
        if (amount > 0) {
            this.metrics.count(RECATEGORIZED_TOTAL, { origin }, amount);
        }
    }

    private count(source: TransactionSource, result: string, amount: number): void {
        if (amount > 0) {
            this.metrics.count(INGESTED_TOTAL, { source, result }, amount);
        }
    }
}
