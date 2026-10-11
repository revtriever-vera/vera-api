import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { ExportFormat } from '../domain/export.types';

const PORTFOLIO_EXPORT: string = 'portfolio-export';

@Injectable()
export class PortfolioExportLogService {
    public constructor(private readonly logService: LogService) {}

    public exported(format: ExportFormat, rows: number, durationMs: number): void {
        this.logService.info({ message: 'portfolio exported', identifier: PORTFOLIO_EXPORT, meta: { format, rows, durationMs } });
    }
}
