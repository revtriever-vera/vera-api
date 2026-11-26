import { Injectable } from '@nestjs/common';
import { InvestmentImportPreviewDomain } from '../domain/investment-import-preview.domain';
import { PreviewView, UploadedReport } from '../domain/investment-import.types';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportPreviewService, PreviewInput } from '../services/investment-import-preview.service';

@Injectable()
export class InvestmentImportPreviewApplication {
    public constructor(
        private readonly service: InvestmentImportPreviewService,
        private readonly previews: InvestmentImportPreviewDomain,
        private readonly logs: InvestmentImportLogService
    ) {}

    public async preview(upload: UploadedReport, input: PreviewInput): Promise<PreviewView> {
        return this.service.preview(upload, input);
    }

    public async purgeExpired(): Promise<number> {
        const removed: number = await this.previews.purgeExpired();
        this.logs.purged(removed);
        return removed;
    }
}
