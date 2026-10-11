import { buildSnapshot } from '../../src/modules/portfolio/domain/portfolio-snapshot';
import type {
    PortfolioSourceData,
    SourceAssignment,
    SourceClass,
    SourcePosition,
    SourceQuote,
    SourceTitle
} from '../../src/modules/portfolio/domain/portfolio.types';
import type { PortfolioSnapshot } from '../../src/modules/portfolio/services/portfolio-snapshot.service';

export type { PortfolioSnapshot, PortfolioSourceData, SourceAssignment, SourceClass, SourcePosition, SourceQuote, SourceTitle };

export function snapshotOf(source: PortfolioSourceData): PortfolioSnapshot {
    return buildSnapshot(source);
}
