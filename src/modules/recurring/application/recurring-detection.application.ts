import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringDetectPublisherService } from '../services/recurring-detect-publisher.service';
import { RecurringDetectionService } from '../services/recurring-detection.service';
import { DetectionCounts, RecurringLogService } from '../services/recurring-log.service';

@Injectable()
export class RecurringDetectionApplication {
    public constructor(
        private readonly detection: RecurringDetectionService,
        private readonly domain: RecurringSeriesDomain,
        private readonly publisher: RecurringDetectPublisherService,
        private readonly logs: RecurringLogService
    ) {}

    @AsCompany()
    public async detect(_companyId: string): Promise<DetectionCounts> {
        return this.detection.run();
    }

    public async fanOutDaily(): Promise<number> {
        const companyIds: string[] = await this.domain.companyIdsWithConfirmedAcrossTenants();
        for (const companyId of companyIds) {
            await this.publisher.request(companyId);
        }
        this.logs.dailyFanout(companyIds.length);
        return companyIds.length;
    }
}
