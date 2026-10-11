import { Injectable } from '@nestjs/common';
import { sanitizeFileName } from '../domain/file-name';
import { toImportSummary } from '../domain/import-summary';
import { PeriodBounds, periodOf } from '../domain/preview-builder';
import { CurrencyMismatchError, MappingRequiredError } from '../domain/statement-import.errors';
import {
    CsvMapping,
    DEFAULT_CURRENCY,
    IMPORT_FORMATS,
    ImportCommitView,
    ImportFormat,
    MAX_REJECTION_EXAMPLES,
    NewAccountKind,
    AccountHint,
    ParsedRow,
    UploadedStatement
} from '../domain/statement-import.types';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { IngestionResult, TransactionIngestionService } from '../../transactions/services/transaction-ingestion.service';
import { ImportView, TransactionImportService } from '../../transactions/services/transaction-import.service';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';
import { ParsedFile, StatementParserService } from '../services/statement-parser.service';

export interface CommitInput {
    readonly format: ImportFormat;
    readonly mapping?: CsvMapping;
    readonly accountId?: string;
    readonly newAccountName?: string;
    readonly newAccountKind?: NewAccountKind;
    readonly newAccountInstitution?: string;
}

interface Target {
    readonly account: FinancialAccount;
    readonly created: boolean;
}

@Injectable()
export class ImportCommitApplication {
    public constructor(
        private readonly parser: StatementParserService,
        private readonly imports: TransactionImportService,
        private readonly ingestion: TransactionIngestionService,
        private readonly accounts: FinancialAccountService,
        private readonly logs: StatementImportLogService,
        private readonly metrics: StatementImportMetricsService
    ) {}

    public async commit(upload: UploadedStatement, input: CommitInput): Promise<ImportCommitView> {
        const startedAt: number = Date.now();
        const existing: FinancialAccount | null = input.accountId === undefined ? null : await this.accounts.requireById(input.accountId);
        const file: ParsedFile = this.parser.parse(upload.buffer, {
            format: input.format,
            mapping: input.mapping,
            currency: existing?.currency ?? null
        });
        this.assertReady(file, existing);
        const target: Target = existing === null ? await this.createTarget(input, file) : { account: existing, created: false };
        try {
            const view: ImportCommitView = await this.run(target.account, file, upload, input.format);
            this.report(file, view, startedAt);
            return view;
        } catch (error) {
            await this.discardNewAccount(target);
            this.logs.record('failed', { format: input.format, durationMs: Date.now() - startedAt, sizeBytes: file.sizeBytes });
            this.metrics.imported(input.format, 'failed');
            throw error;
        }
    }

    private assertReady(file: ParsedFile, existing: FinancialAccount | null): void {
        if (file.statement.pendingMappingRecords !== null) {
            throw new MappingRequiredError();
        }
        const declared: string | null = file.statement.currency;
        if (existing !== null && declared !== null && declared !== existing.currency) {
            throw new CurrencyMismatchError(declared, existing.currency);
        }
    }

    private async createTarget(input: CommitInput, file: ParsedFile): Promise<Target> {
        const hint: AccountHint | null = file.statement.accountHint;
        const account: FinancialAccount = await this.accounts.createFileAccount({
            kind: input.newAccountKind ?? 'other',
            name: input.newAccountName ?? '',
            institutionName: input.newAccountInstitution ?? hint?.institution ?? null,
            numberLast4: hint?.numberLast4 ?? null,
            currency: file.statement.currency ?? DEFAULT_CURRENCY
        });
        return { account, created: true };
    }

    private async run(
        account: FinancialAccount,
        file: ParsedFile,
        upload: UploadedStatement,
        format: ImportFormat
    ): Promise<ImportCommitView> {
        const rows: readonly ParsedRow[] = file.statement.rows;
        const period: PeriodBounds = periodOf(rows);
        const recorded: ImportView = await this.imports.record({
            accountId: account.id,
            format,
            fileName: sanitizeFileName(upload.originalname),
            fileSha256: file.sha256,
            rows: rows.length,
            periodStart: period.start,
            periodEnd: period.end
        });
        try {
            return await this.ingest(account, file, recorded, format);
        } catch (error) {
            await this.rollback(recorded.id);
            throw error;
        }
    }

    private async ingest(
        account: FinancialAccount,
        file: ParsedFile,
        recorded: ImportView,
        format: ImportFormat
    ): Promise<ImportCommitView> {
        const rows: readonly ParsedRow[] = file.statement.rows;
        const result: IngestionResult = await this.ingestion.ingest({
            accountId: account.id,
            source: format === IMPORT_FORMATS.ofx ? 'ofx' : 'csv',
            importId: recorded.id,
            items: this.parser.toIncoming(rows, account.id, account.currency)
        });
        const finished: ImportView = await this.imports.finish(recorded.id, {
            inserted: result.inserted,
            duplicates: rows.length - result.inserted - result.rejected,
            rejected: file.statement.rejections.length + result.rejected
        });
        return {
            ...toImportSummary(finished, account.name),
            rejections: file.statement.rejections.slice(0, MAX_REJECTION_EXAMPLES)
        };
    }

    private async rollback(importId: string): Promise<void> {
        try {
            await this.imports.undo(importId);
            await this.imports.finish(importId, { inserted: 0, duplicates: 0, rejected: 0, status: 'failed' });
        } catch (error) {
            this.logs.rollbackFailed(importId, error instanceof Error ? error.name : 'unknown');
        }
    }

    private async discardNewAccount(target: Target): Promise<void> {
        if (!target.created) {
            return;
        }
        try {
            await this.accounts.removeFileAccount(target.account.id);
        } catch (error) {
            this.logs.rollbackFailed(target.account.id, error instanceof Error ? error.name : 'unknown');
        }
    }

    private report(file: ParsedFile, view: ImportCommitView, startedAt: number): void {
        this.logs.record('committed', {
            importId: view.id,
            format: view.format,
            rows: view.rows,
            inserted: view.inserted,
            duplicates: view.duplicates,
            rejected: view.rejected,
            durationMs: Date.now() - startedAt,
            sizeBytes: file.sizeBytes
        });
        this.metrics.imported(view.format, 'committed');
        this.metrics.rows(view.format, { inserted: view.inserted, duplicate: view.duplicates, rejected: view.rejected });
    }
}
