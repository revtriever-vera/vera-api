import { Injectable } from '@nestjs/common';
import { suggestAccount } from '../domain/account-suggestion';
import { sanitizeFileName } from '../domain/file-name';
import { buildPreview } from '../domain/preview-builder';
import { CsvMapping, ImportFormat, ImportPreview, UploadedStatement } from '../domain/statement-import.types';
import { FinancialAccountService, FinancialAccount } from '../../transactions/services/financial-account.service';
import { ImportView, TransactionImportService } from '../../transactions/services/transaction-import.service';
import { ParsedFile, StatementParserService } from '../services/statement-parser.service';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';

export interface PreviewInput {
    readonly format?: ImportFormat;
    readonly mapping?: CsvMapping;
}

@Injectable()
export class ImportPreviewApplication {
    public constructor(
        private readonly parser: StatementParserService,
        private readonly imports: TransactionImportService,
        private readonly accounts: FinancialAccountService,
        private readonly logs: StatementImportLogService,
        private readonly metrics: StatementImportMetricsService
    ) {}

    public async preview(upload: UploadedStatement, input: PreviewInput): Promise<ImportPreview> {
        const startedAt: number = Date.now();
        const file: ParsedFile = this.parser.parse(upload.buffer, { format: input.format, mapping: input.mapping, currency: null });
        const previous: ImportView | null = await this.imports.findCompletedByHash(file.sha256);
        const preview: ImportPreview = buildPreview(file.statement, {
            detectedFormat: file.detectedFormat,
            fileName: sanitizeFileName(upload.originalname),
            suggestedAccountId: await this.suggestion(file),
            alreadyImportedAt: previous?.createdAt ?? null
        });
        this.logs.record('previewed', {
            format: preview.format,
            rows: preview.rows,
            rejected: preview.rejected,
            durationMs: Date.now() - startedAt,
            sizeBytes: file.sizeBytes
        });
        this.metrics.imported(preview.format, 'previewed');
        return preview;
    }

    private async suggestion(file: ParsedFile): Promise<string | null> {
        if (file.statement.accountHint === null) {
            return null;
        }
        const accounts: FinancialAccount[] = await this.accounts.list();
        return suggestAccount(file.statement.accountHint, accounts);
    }
}
