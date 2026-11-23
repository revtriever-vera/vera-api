import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { Issuer, ResolvedIssuer } from '../../issuers/domain/issuer.types';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { EXPORT_CONTENT_TYPES } from '../../../shared/spreadsheet/spreadsheet.types';
import { writeCsv } from '../domain/csv-writer';
import { buildExportTable } from '../domain/export-rows';
import { Holding, PortfolioSnapshot } from '../../portfolio/domain/portfolio.types';
import { EXPORT_FORMATS, ExportFile, ExportFormat, ExportIssuerInput, ExportSnapshotInput, ExportTable } from '../domain/export.types';
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
        private readonly metrics: PortfolioExportMetricsService,
        private readonly issuers: IssuerDirectoryService
    ) {}

    public async export(format: ExportFormat): Promise<ExportFile> {
        const startedAt: number = performance.now();
        const table: ExportTable = buildExportTable(this.inputOf(await this.snapshots.build()), this.context.get().locale);
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

    private inputOf(snapshot: PortfolioSnapshot): ExportSnapshotInput {
        const issuers: Map<string, ExportIssuerInput> = new Map<string, ExportIssuerInput>();
        for (const holding of snapshot.holdings) {
            this.addIssuer(issuers, holding);
        }
        return { baseCurrency: snapshot.baseCurrency, holdings: snapshot.holdings, classes: snapshot.classes, issuers };
    }

    private addIssuer(issuers: Map<string, ExportIssuerInput>, holding: Holding): void {
        const stored: Issuer | null = holding.issuerId === null ? null : this.issuers.find(holding.issuerId);
        const current: ResolvedIssuer | null = stored === null ? null : this.issuers.resolve(stored.id);
        if (stored !== null && current !== null) {
            issuers.set(stored.id, { name: stored.name, groupName: current.groupName });
        }
    }
}
