import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ExportFormat } from '../domain/export.types';

const EXPORTS_TOTAL: string = 'vera_portfolio_exports_total';

@Injectable()
export class PortfolioExportMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public exported(format: ExportFormat): void {
        this.metrics.count(EXPORTS_TOTAL, { format });
    }
}
