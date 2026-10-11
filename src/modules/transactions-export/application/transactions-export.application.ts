import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { csvLine } from '../../../shared/spreadsheet/csv';
import { EXPORT_CONTENT_TYPES, EXPORT_FORMATS, ExportFile, ExportFormat } from '../../../shared/spreadsheet/spreadsheet.types';
import { XlsxSheetBuilder } from '../../../shared/spreadsheet/xlsx';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { CategoryReaderService, SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { DescriptionNormalizerService } from '../../spending-categories/services/description-normalizer.service';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { columnsOf, csvCellsOf, exportRowOf, headerOf, xlsxCellsOf } from '../domain/export-columns';
import { categoryLabelOf, sheetNameOf } from '../domain/export-labels';
import { firstDayOf, lastDayOf, monthOf } from '../domain/export-period';
import { ExportTooLargeError } from '../domain/transactions-export.errors';
import {
    ExportQueryPayload,
    ExportTransaction,
    MAX_EXPORT_ROWS,
    TransactionExportRow,
    TransactionFilter
} from '../domain/transactions-export.types';
import { TransactionsExportLogService } from '../services/transactions-export-log.service';
import { TransactionsExportMetricsService } from '../services/transactions-export-metrics.service';

const BOM: string = '﻿';

interface RenderedFile {
    readonly content: Buffer;
    readonly rows: number;
}

@Injectable()
export class TransactionsExportApplication {
    public constructor(
        private readonly reader: TransactionReaderService,
        private readonly accounts: FinancialAccountService,
        private readonly categories: CategoryReaderService,
        private readonly normalizer: DescriptionNormalizerService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext,
        private readonly logs: TransactionsExportLogService,
        private readonly metrics: TransactionsExportMetricsService
    ) {}

    public async export(format: ExportFormat, payload: ExportQueryPayload): Promise<ExportFile> {
        const startedAt: number = performance.now();
        const locale: AppLocale = this.context.get().locale;
        if (payload.accountId !== undefined) {
            await this.accounts.requireById(payload.accountId);
        }
        const filter: TransactionFilter = await this.filterOf(payload);
        await this.assertWithinLimit(format, filter);
        const rows: AsyncIterable<TransactionExportRow> = this.rowsOf(filter, await this.categoryLabels(locale), locale);
        const file: RenderedFile = format === EXPORT_FORMATS.csv ? await this.csvOf(rows, locale) : await this.xlsxOf(rows, locale);
        const today: string = await this.timezones.todayInCompany();
        this.logs.exported(format, file.rows, Math.round(performance.now() - startedAt), file.content.length);
        this.metrics.exported(format, 'ok');
        return { filename: `vera-transacoes-${today}.${format}`, contentType: EXPORT_CONTENT_TYPES[format], ...file };
    }

    private async assertWithinLimit(format: ExportFormat, filter: TransactionFilter): Promise<void> {
        const rows: number = await this.reader.countForExport(filter);
        if (rows > MAX_EXPORT_ROWS) {
            this.logs.refused(format, rows);
            this.metrics.exported(format, 'too_large');
            throw new ExportTooLargeError(rows, MAX_EXPORT_ROWS);
        }
    }

    private async filterOf(payload: ExportQueryPayload): Promise<TransactionFilter> {
        const hasRange: boolean = payload.from !== undefined && payload.to !== undefined;
        const month: string = payload.month ?? monthOf(await this.timezones.todayInCompany());
        return {
            fromDate: hasRange ? (payload.from as string) : firstDayOf(month),
            toDate: hasRange ? (payload.to as string) : lastDayOf(month),
            accountId: payload.accountId,
            categoryId: payload.categoryId,
            uncategorized: payload.uncategorized === 'true',
            direction: payload.direction,
            search: payload.q === undefined ? undefined : this.searchOf(payload.q)
        };
    }

    private searchOf(text: string): string {
        const normalized: string = this.normalizer.normalize(text);
        return normalized.length > 0 ? normalized : text.trim();
    }

    private async categoryLabels(locale: AppLocale): Promise<Map<string, string>> {
        const categories: readonly SpendingCategory[] = await this.categories.listForCompany();
        return new Map<string, string>(
            categories.map((category: SpendingCategory): [string, string] => [category.id, categoryLabelOf(category, locale)])
        );
    }

    private async *rowsOf(
        filter: TransactionFilter,
        labels: ReadonlyMap<string, string>,
        locale: AppLocale
    ): AsyncIterable<TransactionExportRow> {
        const uncategorized: string = categoryLabelOf(undefined, locale);
        for await (const page of this.reader.pagesForExport(filter)) {
            yield* page.map((transaction: ExportTransaction): TransactionExportRow =>
                exportRowOf(transaction, this.labelOf(transaction, labels, uncategorized), locale)
            );
        }
    }

    private labelOf(transaction: ExportTransaction, labels: ReadonlyMap<string, string>, uncategorized: string): string {
        return transaction.categoryId === null ? uncategorized : (labels.get(transaction.categoryId) ?? uncategorized);
    }

    private async csvOf(rows: AsyncIterable<TransactionExportRow>, locale: AppLocale): Promise<RenderedFile> {
        const lines: string[] = [BOM + csvLine(headerOf(locale), locale)];
        for await (const row of rows) {
            lines.push(csvLine(csvCellsOf(row, locale), locale));
        }
        return { content: Buffer.from(lines.join(''), 'utf8'), rows: lines.length - 1 };
    }

    private async xlsxOf(rows: AsyncIterable<TransactionExportRow>, locale: AppLocale): Promise<RenderedFile> {
        const builder: XlsxSheetBuilder = new XlsxSheetBuilder({ name: sheetNameOf(locale), columns: columnsOf(locale) });
        let count: number = 0;
        for await (const row of rows) {
            builder.append(xlsxCellsOf(row));
            count += 1;
        }
        return { content: await builder.finish(), rows: count };
    }
}
