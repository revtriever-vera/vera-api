import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { LLM_TASK_CATALOG } from '../../../core/llm/catalog/llm-task.catalog';
import { LlmTaskSpec } from '../../../core/llm/catalog/llm-task.types';
import { LlmTask } from '../../../core/llm/llm.types';
import type { ContributionSuggestion } from '../../contribution/services/contribution-planner.service';
import type { ConcentrationResponse } from '../../concentration/services/concentration-reader.service';
import type { MaturityItem } from '../../fixed-income-schedule/services/maturities-reader.service';
import type { LookupEntry } from '../../market-benchmarks/services/asset-lookup.service';
import type { BenchmarkWindow, BenchmarkWindows } from '../../market-benchmarks/services/benchmark.service';
import type { FixedIncomeComparison } from '../../market-benchmarks/services/fixed-income-benchmark.service';
import type { FundPerformance, FundWindow } from '../../market-benchmarks/services/fund-performance.service';
import type { PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import type { CutsResult } from '../../spending-cuts/services/spending-cuts.service';
import type { MonthlySummary } from '../../spending-summary/services/spending-summary.service';
import {
    AiAssetLookupContext,
    AiBenchmarksContext,
    AiConcentrationContext,
    AiContext,
    AiCutsContext,
    AiFixedIncomeBenchmarkContext,
    AiFundPerformanceContext,
    AiMaturitiesContext,
    AiMonthContext,
    AiPortfolioContext,
    BuiltContext
} from '../domain/context/ai-context.types';
import { contextHash } from '../domain/context/context-hash';
import { buildBenchmarksContext } from '../domain/context/benchmarks.context';
import { buildConcentrationContext } from '../domain/context/concentration.context';
import { buildCutsContext } from '../domain/context/cuts.context';
import { buildMaturitiesContext } from '../domain/context/maturities.context';
import { buildMonthContext } from '../domain/context/month.context';
import { buildPortfolioContext } from '../domain/context/portfolio.context';
import { buildAssetLookupContext, buildFixedIncomeBenchmarkContext, buildFundPerformanceContext } from '../domain/context/research.context';

@Injectable()
export class AiContextBuilderService {
    public constructor(private readonly context: AppContext) {}

    public month(summary: MonthlySummary): BuiltContext<AiMonthContext> {
        return buildMonthContext(summary, this.context.get().locale);
    }

    public cuts(result: CutsResult): BuiltContext<AiCutsContext> | null {
        return buildCutsContext(result, this.context.get().locale);
    }

    public portfolio(snapshot: PortfolioSnapshot, contribution: ContributionSuggestion | null): BuiltContext<AiPortfolioContext> {
        return buildPortfolioContext(snapshot, contribution, this.context.get().locale);
    }

    public concentration(response: ConcentrationResponse): BuiltContext<AiConcentrationContext> {
        return buildConcentrationContext(response, this.context.get().locale);
    }

    public maturities(items: readonly MaturityItem[], untilMonth: string): BuiltContext<AiMaturitiesContext> {
        return buildMaturitiesContext(items, untilMonth, this.context.get().locale);
    }

    public benchmarks(windows: BenchmarkWindows, shown: readonly BenchmarkWindow[] | undefined): BuiltContext<AiBenchmarksContext> {
        return buildBenchmarksContext(windows, shown, this.context.get().locale);
    }

    public assetLookup(entries: readonly LookupEntry[]): BuiltContext<AiAssetLookupContext> {
        return buildAssetLookupContext(entries, this.context.get().locale);
    }

    public fundPerformance(performance: FundPerformance, shown: readonly FundWindow[]): BuiltContext<AiFundPerformanceContext> {
        return buildFundPerformanceContext(performance, shown, this.context.get().locale);
    }

    public fixedIncomeBenchmark(comparison: FixedIncomeComparison): BuiltContext<AiFixedIncomeBenchmarkContext> {
        return buildFixedIncomeBenchmarkContext(comparison, this.context.get().locale);
    }

    public hash(context: AiContext, task: LlmTask): string {
        const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find((item: LlmTaskSpec): boolean => item.task === task);
        if (spec === undefined) {
            throw new Error(`task "${task}" is not in the LLM task catalog`);
        }
        return contextHash(context, this.context.get().locale, spec.promptVersion);
    }
}
