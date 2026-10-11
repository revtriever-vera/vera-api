import { Injectable } from '@nestjs/common';
import { buildSnapshot } from '../domain/portfolio-snapshot';
import { OrphanHolding, PortfolioSnapshot, PortfolioSourceData } from '../domain/portfolio.types';
import { PortfolioSourcePort } from '../ports/portfolio-source.port';
import { PortfolioLogService } from './portfolio-log.service';
import { PortfolioMetricsService } from './portfolio-metrics.service';

export type {
    ClassSummary,
    DeviationStatus,
    Holding,
    HoldingKind,
    PortfolioQuality,
    PortfolioSnapshot,
    ValueSource
} from '../domain/portfolio.types';
export { effectiveAssetTargets } from '../domain/effective-targets';

@Injectable()
export class PortfolioSnapshotService {
    public constructor(
        private readonly source: PortfolioSourcePort,
        private readonly logs: PortfolioLogService,
        private readonly metrics: PortfolioMetricsService
    ) {}

    public async build(): Promise<PortfolioSnapshot> {
        const startedAt: number = performance.now();
        const data: PortfolioSourceData = await this.source.load();
        const snapshot: PortfolioSnapshot = buildSnapshot(data);
        this.report(snapshot, Math.round(performance.now() - startedAt));
        return snapshot;
    }

    private report(snapshot: PortfolioSnapshot, durationMs: number): void {
        snapshot.orphanHoldings.forEach((orphan: OrphanHolding): void => {
            this.logs.orphanHolding(orphan.subjectType, orphan.subjectId);
        });
        this.logs.snapshot({
            holdings: snapshot.holdings.length,
            classes: snapshot.classes.length,
            missingQuotes: snapshot.quality.missingQuotes,
            staleQuotes: snapshot.quality.staleQuotes,
            durationMs
        });
        this.metrics.snapshotDuration(durationMs);
        this.metrics.missingQuotes(snapshot.quality.missingQuotes);
    }
}
