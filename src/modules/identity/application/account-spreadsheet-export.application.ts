import { Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { AppContext } from '../../../core/context/app-context.port';
import { XlsxSheetWriter, XlsxWorkbookBuilder } from '../../../shared/spreadsheet/xlsx';
import { ZipEntry, zipOf } from '../../../shared/spreadsheet/zip';
import { UnauthorizedError } from '../domain/identity.errors';
import { ACCOUNT_EXPORT_OUTCOMES } from '../domain/identity.types';
import { SpreadsheetSheet } from '../services/account-spreadsheet-exporter.port';
import { AccountExportBuilder, AccountExportFile } from '../services/account-export.builder';
import { AccountSpreadsheetRegistry } from '../services/account-spreadsheet.registry';
import { CompanyTimezoneService } from '../services/company-timezone.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';

const JSON_ENTRY: string = 'dados.json';

export interface AccountSpreadsheetExportFile {
    readonly filename: string;
    readonly stream: Readable;
}

interface Counters {
    sheets: number;
    rows: number;
}

@Injectable()
export class AccountSpreadsheetExportApplication {
    public constructor(
        private readonly registry: AccountSpreadsheetRegistry,
        private readonly builder: AccountExportBuilder,
        private readonly timezones: CompanyTimezoneService,
        private readonly logs: IdentityLogService,
        private readonly metrics: IdentityMetricsService,
        private readonly context: AppContext
    ) {}

    public async export(): Promise<AccountSpreadsheetExportFile> {
        const companyId: string | undefined = this.context.get().companyId;
        if (companyId === undefined) {
            throw new UnauthorizedError();
        }
        try {
            const sheets: SpreadsheetSheet[] = await this.registry.sheets();
            const json: AccountExportFile = await this.builder.build(companyId);
            const today: string = await this.timezones.todayInCompany();
            return { filename: `vera-meus-dados-${today}.zip`, stream: zipOf(this.entries(sheets, json)) };
        } catch (error: unknown) {
            this.metrics.accountSpreadsheetExport(ACCOUNT_EXPORT_OUTCOMES.failed);
            throw error;
        }
    }

    private async *entries(sheets: readonly SpreadsheetSheet[], json: AccountExportFile): AsyncGenerator<ZipEntry> {
        const startedAt: number = performance.now();
        const counters: Counters = { sheets: 0, rows: 0 };
        try {
            for (const [file, group] of this.filesOf(sheets)) {
                yield { name: `${file}.xlsx`, content: await this.workbookOf(group, counters) };
            }
            yield { name: JSON_ENTRY, content: Buffer.from(JSON.stringify(json, null, 2), 'utf8') };
        } catch (error: unknown) {
            this.metrics.accountSpreadsheetExport(ACCOUNT_EXPORT_OUTCOMES.failed);
            this.logs.spreadsheetsFailed(error);
            throw error;
        }
        this.metrics.accountSpreadsheetExport(ACCOUNT_EXPORT_OUTCOMES.success);
        this.logs.spreadsheetsExported(counters.sheets, counters.rows, Math.round(performance.now() - startedAt));
    }

    private filesOf(sheets: readonly SpreadsheetSheet[]): Map<string, SpreadsheetSheet[]> {
        const files: Map<string, SpreadsheetSheet[]> = new Map<string, SpreadsheetSheet[]>();
        for (const sheet of sheets) {
            files.set(sheet.file, [...(files.get(sheet.file) ?? []), sheet]);
        }
        return files;
    }

    private async workbookOf(group: readonly SpreadsheetSheet[], counters: Counters): Promise<Buffer> {
        const book: XlsxWorkbookBuilder = new XlsxWorkbookBuilder();
        for (const sheet of group) {
            await this.writeSheet(book, sheet, counters);
        }
        return book.finish();
    }

    private async writeSheet(book: XlsxWorkbookBuilder, sheet: SpreadsheetSheet, counters: Counters): Promise<void> {
        const writer: XlsxSheetWriter = book.sheet({ name: sheet.name, columns: sheet.columns });
        for await (const row of sheet.rows) {
            writer.append(row);
            counters.rows += 1;
        }
        writer.commit();
        counters.sheets += 1;
    }
}
