import { Injectable } from '@nestjs/common';
import { Concentration, UNMAPPED_DIMENSIONS } from '../domain/concentration.types';
import { ConcentrationLogService } from '../services/concentration-log.service';
import { ConcentrationMetricsService } from '../services/concentration-metrics.service';
import { ConcentrationReaderService, ConcentrationReading } from '../services/concentration-reader.service';
import { ConcentrationResponse } from '../validation/concentration.schemas';

@Injectable()
export class ConcentrationApplication {
    public constructor(
        private readonly reader: ConcentrationReaderService,
        private readonly logs: ConcentrationLogService,
        private readonly metrics: ConcentrationMetricsService
    ) {}

    public async get(): Promise<ConcentrationResponse> {
        const reading: ConcentrationReading = await this.reader.read();
        this.report(reading.concentration);
        return reading.response;
    }

    private report(concentration: Concentration): void {
        this.metrics.requested();
        this.metrics.unmappedRatio(UNMAPPED_DIMENSIONS.issuer, concentration.unmappedIssuerRatio);
        this.metrics.unmappedRatio(UNMAPPED_DIMENSIONS.sector, concentration.unmappedSectorRatio);
        this.logs.computed(concentration.byIssuer.length + (concentration.byIssuerOthers?.groups ?? 0), concentration.unmappedHoldings);
    }
}
