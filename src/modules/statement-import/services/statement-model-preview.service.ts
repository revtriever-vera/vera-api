import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { ImportView, TransactionImportService } from '../../transactions/services/transaction-import.service';
import { suggestAccount } from '../domain/account-suggestion';
import { sanitizeFileName } from '../domain/file-name';
import { statementOfReading } from '../domain/model-reading';
import { buildPreview } from '../domain/preview-builder';
import { OpenModelPreview, StatementImportPreviewDomain } from '../domain/statement-import-preview.domain';
import {
    AccountHint,
    ImportPreview,
    MODEL_FORMAT,
    MODEL_PREVIEW_EXPIRY_MARGIN_MS,
    ModelPreview,
    ModelTransaction,
    ParsedRow,
    ParsedStatement,
    UploadedStatement
} from '../domain/statement-import.types';
import { StatementImportLogService } from './statement-import-log.service';
import { StatementImportMetricsService } from './statement-import-metrics.service';
import { StatementModelReaderService } from './statement-model-reader.service';

function transactionOf(row: ParsedRow): ModelTransaction {
    return { line: row.line, date: row.date, description: row.description, amountMinor: row.amountMinor };
}

function modelPreviewOf(open: OpenModelPreview): ModelPreview {
    return {
        previewId: open.preview.id,
        expiresAt: open.preview.expiresAt.toISOString(),
        transactions: open.reading.rows.map(transactionOf),
        pagesNotRead: open.reading.pagesNotRead
    };
}

@Injectable()
export class StatementModelPreviewService {
    public constructor(
        private readonly reader: StatementModelReaderService,
        private readonly previews: StatementImportPreviewDomain,
        private readonly imports: TransactionImportService,
        private readonly accounts: FinancialAccountService,
        private readonly publisher: QueuePublisherPort,
        private readonly context: AppContext,
        private readonly logs: StatementImportLogService,
        private readonly metrics: StatementImportMetricsService
    ) {}

    public accepts(bytes: Uint8Array): boolean {
        return this.reader.accepts(bytes);
    }

    public async preview(upload: UploadedStatement, consent: boolean): Promise<ImportPreview> {
        const startedAt: number = Date.now();
        await this.reader.assertConsented(consent);
        const sha256: string = createHash('sha256').update(upload.buffer).digest('hex');
        const open: OpenModelPreview = (await this.previews.findOpenByHash(sha256)) ?? (await this.readAndStore(upload, sha256));
        const preview: ImportPreview = await this.viewOf(open);
        this.logs.record('previewed', {
            format: MODEL_FORMAT,
            rows: preview.rows,
            rejected: preview.rejected,
            durationMs: Date.now() - startedAt,
            sizeBytes: upload.buffer.length
        });
        this.metrics.imported(MODEL_FORMAT, 'previewed');
        return preview;
    }

    public async expire(previewId: string): Promise<void> {
        this.logs.previewExpired(previewId, await this.previews.removeExpired(previewId));
    }

    private async readAndStore(upload: UploadedStatement, sha256: string): Promise<OpenModelPreview> {
        const open: OpenModelPreview = await this.previews.create({
            createdBy: this.context.getOrNull()?.userId ?? null,
            fileSha256: sha256,
            fileName: sanitizeFileName(upload.originalname),
            reading: await this.reader.read(upload.buffer)
        });
        await this.scheduleExpiry(open);
        return open;
    }

    private async scheduleExpiry(open: OpenModelPreview): Promise<void> {
        const delayMs: number = Math.max(0, open.preview.expiresAt.getTime() - Date.now()) + MODEL_PREVIEW_EXPIRY_MARGIN_MS;
        try {
            await this.publisher.publish(
                QUEUES.statementImport,
                MESSAGE_TYPES.statementImportPreviewExpired,
                { previewId: open.preview.id },
                { jobId: `statement-preview-expired-${open.preview.id}`, delayMs }
            );
        } catch (error: unknown) {
            this.logs.expiryNotScheduled(open.preview.id, error instanceof Error ? error.name : 'unknown');
        }
    }

    private async viewOf(open: OpenModelPreview): Promise<ImportPreview> {
        const statement: ParsedStatement = statementOfReading(open.reading);
        const previous: ImportView | null = await this.imports.findCompletedByHash(open.preview.fileSha256);
        return buildPreview(statement, {
            detectedFormat: MODEL_FORMAT,
            fileName: open.preview.fileName,
            suggestedAccountId: await this.suggestion(statement.accountHint),
            alreadyImportedAt: previous?.createdAt ?? null,
            model: modelPreviewOf(open)
        });
    }

    private async suggestion(hint: AccountHint | null): Promise<string | null> {
        if (hint === null) {
            return null;
        }
        const accounts: FinancialAccount[] = await this.accounts.list();
        return suggestAccount(hint, accounts);
    }
}
