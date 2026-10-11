import { Injectable } from '@nestjs/common';
import { Page } from '../../../shared/pagination/pagination.types';
import { toImportSummary } from '../domain/import-summary';
import { ImportSummary } from '../domain/statement-import.types';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { ImportView, TransactionImportService } from '../../transactions/services/transaction-import.service';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';

@Injectable()
export class ImportListApplication {
    public constructor(
        private readonly imports: TransactionImportService,
        private readonly accounts: FinancialAccountService,
        private readonly logs: StatementImportLogService,
        private readonly metrics: StatementImportMetricsService
    ) {}

    public async list(page: number, pageSize: number): Promise<Page<ImportSummary>> {
        const result: Page<ImportView> = await this.imports.list(page, pageSize);
        const names: Map<string, string> = await this.accountNames();
        return {
            data: result.data.map((view: ImportView): ImportSummary => toImportSummary(view, names.get(view.accountId) ?? '')),
            pagination: result.pagination
        };
    }

    public async undo(id: string): Promise<{ removed: number }> {
        const startedAt: number = Date.now();
        const view: ImportView = await this.imports.find(id);
        const result: { removed: number } = await this.imports.undo(id);
        this.logs.record('undone', { importId: id, format: view.format, inserted: result.removed, durationMs: Date.now() - startedAt });
        this.metrics.imported(view.format, 'undone');
        return result;
    }

    private async accountNames(): Promise<Map<string, string>> {
        const accounts: FinancialAccount[] = await this.accounts.list();
        return new Map<string, string>(accounts.map((account: FinancialAccount): [string, string] => [account.id, account.name]));
    }
}
