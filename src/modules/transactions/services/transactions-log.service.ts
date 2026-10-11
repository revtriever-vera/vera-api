import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { IngestionResult, TransactionSource } from '../domain/transactions.types';

const INGEST: string = 'transactions-ingest';
const RECATEGORIZE: string = 'transactions-recategorize';
const PORT: string = 'transactions-port';

@Injectable()
export class TransactionsLogService {
    public constructor(private readonly logService: LogService) {}

    public ingested(source: TransactionSource, accountId: string, result: IngestionResult, durationMs: number): void {
        this.logService.info({
            message: 'transactions ingested',
            identifier: INGEST,
            meta: {
                source,
                accountId,
                inserted: result.inserted,
                updated: result.updated,
                unchanged: result.unchanged,
                duplicates: result.duplicates,
                superseded: result.superseded,
                rejected: result.rejected,
                durationMs
            }
        });
    }

    public recategorized(transactionId: string, ruleCreated: boolean, recategorized: number): void {
        this.logService.info({
            message: 'transaction recategorized by the user',
            identifier: RECATEGORIZE,
            meta: { transactionId, ruleCreated, recategorized }
        });
    }

    public portScope(scope: string, affected: number): void {
        this.logService.info({ message: 'recategorization port ran', identifier: PORT, meta: { scope, affected } });
    }
}
