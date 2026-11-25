import { Injectable } from '@nestjs/common';
import { Page } from '../../../shared/pagination/pagination.types';
import { AppError } from '../../../shared/errors/app.error';
import { InvestmentImportReaderService, InvestmentImportRecord } from '../../positions/services/investment-import-reader.service';
import { PositionOperationsService } from '../../positions/services/position-operations.service';
import { ImportUndoBlockedError } from '../domain/investment-import.errors';
import { ImportRecordView } from '../domain/investment-import.types';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';

const UNDO_BLOCK_REASONS: Readonly<Record<string, 'later_import' | 'position_changed'>> = {
    'positions.undo_blocked_by_later_import': 'later_import',
    'positions.changed_since_import': 'position_changed'
};

function viewOf(record: InvestmentImportRecord): ImportRecordView {
    return {
        id: record.id,
        source: record.source,
        fileName: record.fileName,
        status: record.status,
        operations: record.operations,
        createdAt: record.createdAt.toISOString()
    };
}

@Injectable()
export class InvestmentImportListApplication {
    public constructor(
        private readonly records: InvestmentImportReaderService,
        private readonly positions: PositionOperationsService,
        private readonly logs: InvestmentImportLogService,
        private readonly metrics: InvestmentImportMetricsService
    ) {}

    public async list(page: number, pageSize: number): Promise<Page<ImportRecordView>> {
        const result: Page<InvestmentImportRecord> = await this.records.page(page, pageSize);
        return { data: result.data.map(viewOf), pagination: result.pagination };
    }

    public async undo(id: string): Promise<{ undone: boolean }> {
        const startedAt: number = Date.now();
        const record: InvestmentImportRecord = await this.records.require(id);
        try {
            await this.positions.undo(id);
        } catch (error) {
            throw translateUndoError(error);
        }
        const durationMs: number = Date.now() - startedAt;
        this.logs.record('undone', { source: record.source, importId: id, durationMs });
        this.metrics.outcome(record.source, 'undone', durationMs);
        return { undone: true };
    }
}

function translateUndoError(error: unknown): unknown {
    if (!(error instanceof AppError)) {
        return error;
    }
    const reason: 'later_import' | 'position_changed' | undefined = UNDO_BLOCK_REASONS[error.code];
    return reason === undefined ? error : new ImportUndoBlockedError(reason, error);
}
