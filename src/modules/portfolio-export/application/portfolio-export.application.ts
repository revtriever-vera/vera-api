import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { EXPORT_CONTENT_TYPES } from '../../../shared/spreadsheet/spreadsheet.types';
import { writeCsv } from '../domain/csv-writer';
import { buildExportTable } from '../domain/export-rows';
import { EXPORT_FORMATS, ExportFile, ExportFormat, ExportTable } from '../domain/export.types';
import { PortfolioExportLogService } from '../services/portfolio-export-log.service';
import { PortfolioExportMetricsService } from '../services/portfolio-export-metrics.service';
import { XlsxWriterService } from '../services/xlsx-writer.service';

@Injectable()
export class PortfolioExportApplication {
    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly xlsx: XlsxWriterService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext,
        private readonly logs: PortfolioExportLogService,
        private readonly metrics: PortfolioExportMetricsService
    ) {}

    public async export(format: ExportFormat): Promise<ExportFile> {
        const startedAt: number = performance.now();
        const table: ExportTable = buildExportTable(await this.snapshots.build(), this.context.get().locale);
        const content: Buffer = format === EXPORT_FORMATS.csv ? Buffer.from(writeCsv(table), 'utf8') : await this.xlsx.write(table);
        const today: string = await this.timezones.todayInCompany();
        this.logs.exported(format, table.rows.length, Math.round(performance.now() - startedAt));
        this.metrics.exported(format);
        return {
            filename: `vera-carteira-${today}.${format}`,
            contentType: EXPORT_CONTENT_TYPES[format],
            content,
            rows: table.rows.length
        };
    }
}
