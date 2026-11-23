import { Injectable } from '@nestjs/common';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { sheetNameOf } from '../domain/export-labels';
import { ExportTable } from '../domain/export.types';
import { PortfolioExportTableService } from './portfolio-export-table.service';
import { XlsxWriterService } from './xlsx-writer.service';

export const PORTFOLIO_SPREADSHEET_FILE: string = 'carteira';

@Injectable()
export class PortfolioAccountSpreadsheet extends AccountSpreadsheetExporterPort {
    public readonly name: string = 'portfolio';

    public constructor(
        private readonly tables: PortfolioExportTableService,
        private readonly xlsx: XlsxWriterService
    ) {
        super();
    }

    public async sheets(): Promise<readonly SpreadsheetSheet[]> {
        const table: ExportTable = await this.tables.build(true);
        return [
            {
                file: PORTFOLIO_SPREADSHEET_FILE,
                name: sheetNameOf(table.locale),
                columns: this.xlsx.columnsOf(table),
                rows: this.xlsx.cellsOf(table)
            }
        ];
    }
}
