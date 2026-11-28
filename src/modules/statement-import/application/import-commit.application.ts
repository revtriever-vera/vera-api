import { Injectable } from '@nestjs/common';
import { sanitizeFileName } from '../domain/file-name';
import { toImportSummary } from '../domain/import-summary';
import { statementOfReading } from '../domain/model-reading';
import { PeriodBounds, periodOf } from '../domain/preview-builder';
import { OpenModelPreview, StatementImportPreviewDomain } from '../domain/statement-import-preview.domain';
import { CurrencyMismatchError, MappingRequiredError } from '../domain/statement-import.errors';
import {
    CsvMapping,
    DEFAULT_CURRENCY,
    IMPORT_FORMATS,
    ImportCommitView,
    ImportFormat,
    MAX_REJECTION_EXAMPLES,
    MODEL_FORMAT,
    NewAccountKind,
    AccountHint,
    ParsedRow,
    ParsedStatement,
    StoredImportFormat,
    UploadedStatement
} from '../domain/statement-import.types';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { IngestionBatch, IngestionResult, TransactionIngestionService } from '../../transactions/services/transaction-ingestion.service';
import { ImportView, TransactionImportService } from '../../transactions/services/transaction-import.service';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';
import { ParsedFile, StatementParserService } from '../services/statement-parser.service';

export interface AccountChoice {
    readonly accountId?: string;
    readonly newAccountName?: string;
    readonly newAccountKind?: NewAccountKind;
    readonly newAccountInstitution?: string;
}

export interface CommitInput extends AccountChoice {
    readonly format: ImportFormat;
    readonly mapping?: CsvMapping;
}

export interface ModelCommitInput extends AccountChoice {
    readonly previewId: string;
}

interface Target {
    readonly account: FinancialAccount;
    readonly created: boolean;
}

interface Batch {
    readonly statement: ParsedStatement;
    readonly format: StoredImportFormat;
    readonly fileName: string;
    readonly sha256: string;
    readonly sizeBytes: number | undefined;
}

function sourceOf(format: StoredImportFormat): IngestionBatch['source'] {
    if (format === MODEL_FORMAT) {
        return 'model';
    }
    return format === IMPORT_FORMATS.ofx ? 'ofx' : 'csv';
}

@Injectable()
export class ImportCommitApplication {
    public constructor(
        private readonly parser: StatementParserService,
        private readonly imports: TransactionImportService,
        private readonly ingestion: TransactionIngestionService,
        private readonly accounts: FinancialAccountService,
        private readonly previews: StatementImportPreviewDomain,
        private readonly logs: StatementImportLogService,
        private readonly metrics: StatementImportMetricsService
    ) {}

    public async commit(upload: UploadedStatement, input: CommitInput): Promise<ImportCommitView> {
        const startedAt: number = Date.now();
        const existing: FinancialAccount | null = await this.existingOf(input);
        const file: ParsedFile = this.parser.parse(upload.buffer, {
            format: input.format,
            mapping: input.mapping,
            currency: existing?.currency ?? null
        });
        const batch: Batch = {
            statement: file.statement,
            format: input.format,
            fileName: sanitizeFileName(upload.originalname),
            sha256: file.sha256,
            sizeBytes: file.sizeBytes
        };
        return this.save(batch, input, existing, startedAt);
    }

    public async commitPreview(input: ModelCommitInput): Promise<ImportCommitView> {
        const startedAt: number = Date.now();
        const existing: FinancialAccount | null = await this.existingOf(input);
        const open: OpenModelPreview = await this.previews.requireOpen(input.previewId);
        const batch: Batch = {
            statement: statementOfReading(open.reading),
            format: MODEL_FORMAT,
            fileName: open.preview.fileName,
            sha256: open.preview.fileSha256,
            sizeBytes: undefined
        };
        this.assertReady(batch.statement, existing);
        await this.previews.consume(input.previewId);
        return this.save(batch, input, existing, startedAt);
    }

    private async existingOf(input: AccountChoice): Promise<FinancialAccount | null> {
        return input.accountId === undefined ? null : this.accounts.requireById(input.accountId);
    }

    private async save(
        batch: Batch,
        input: AccountChoice,
        existing: FinancialAccount | null,
        startedAt: number
    ): Promise<ImportCommitView> {
        this.assertReady(batch.statement, existing);
        const target: Target = existing === null ? await this.createTarget(input, batch.statement) : { account: existing, created: false };
        try {
            const view: ImportCommitView = await this.run(target.account, batch);
            this.report(batch, view, startedAt);
            return view;
        } catch (error) {
            await this.discardNewAccount(target);
            this.logs.record('failed', { format: batch.format, durationMs: Date.now() - startedAt, sizeBytes: batch.sizeBytes });
            this.metrics.imported(batch.format, 'failed');
            throw error;
        }
    }

    private assertReady(statement: ParsedStatement, existing: FinancialAccount | null): void {
        if (statement.pendingMappingRecords !== null) {
            throw new MappingRequiredError();
        }
        const declared: string | null = statement.currency;
        if (existing !== null && declared !== null && declared !== existing.currency) {
            throw new CurrencyMismatchError(declared, existing.currency);
        }
    }

    private async createTarget(input: AccountChoice, statement: ParsedStatement): Promise<Target> {
        const hint: AccountHint | null = statement.accountHint;
        const account: FinancialAccount = await this.accounts.createFileAccount({
            kind: input.newAccountKind ?? 'other',
            name: input.newAccountName ?? '',
            institutionName: input.newAccountInstitution ?? hint?.institution ?? null,
            numberLast4: hint?.numberLast4 ?? null,
            currency: statement.currency ?? DEFAULT_CURRENCY
        });
        return { account, created: true };
    }

    private async run(account: FinancialAccount, batch: Batch): Promise<ImportCommitView> {
        const rows: readonly ParsedRow[] = batch.statement.rows;
        const period: PeriodBounds = periodOf(rows);
        const recorded: ImportView = await this.imports.record({
            accountId: account.id,
            format: batch.format,
            fileName: batch.fileName,
            fileSha256: batch.sha256,
            rows: rows.length,
            periodStart: period.start,
            periodEnd: period.end
        });
        try {
            return await this.ingest(account, batch, recorded);
        } catch (error) {
            await this.rollback(recorded.id);
            throw error;
        }
    }

    private async ingest(account: FinancialAccount, batch: Batch, recorded: ImportView): Promise<ImportCommitView> {
        const rows: readonly ParsedRow[] = batch.statement.rows;
        const result: IngestionResult = await this.ingestion.ingest({
            accountId: account.id,
            source: sourceOf(batch.format),
            importId: recorded.id,
            items: this.parser.toIncoming(rows, account.id, account.currency)
        });
        const finished: ImportView = await this.imports.finish(recorded.id, {
            inserted: result.inserted,
            duplicates: rows.length - result.inserted - result.rejected,
            rejected: batch.statement.rejections.length + result.rejected
        });
        return {
            ...toImportSummary(finished, account.name),
            rejections: batch.statement.rejections.slice(0, MAX_REJECTION_EXAMPLES)
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

    private report(batch: Batch, view: ImportCommitView, startedAt: number): void {
        this.logs.record('committed', {
            importId: view.id,
            format: view.format,
            rows: view.rows,
            inserted: view.inserted,
            duplicates: view.duplicates,
            rejected: view.rejected,
            durationMs: Date.now() - startedAt,
            sizeBytes: batch.sizeBytes
        });
        this.metrics.imported(view.format, 'committed');
        this.metrics.rows(view.format, { inserted: view.inserted, duplicate: view.duplicates, rejected: view.rejected });
    }
}
