import { Injectable } from '@nestjs/common';
import { RealRateItem, RealRatesReaderService, RealRatesReading } from '../../fixed-income-schedule/services/real-rates-reader.service';
import {
    FIXED_INCOME_STATES,
    FixedIncomeComparison,
    FixedIncomeReference,
    FixedIncomeState,
    FixedIncomeTitleFigures,
    MAX_LISTED_TITLES,
    TITLE_KEY_PREFIX
} from '../domain/fixed-income-benchmark.types';
import { BenchmarkWindows } from '../domain/benchmark.types';
import { BenchmarkService } from './benchmark.service';

export { FIXED_INCOME_STATES } from '../domain/fixed-income-benchmark.types';
export type {
    FixedIncomeComparison,
    FixedIncomeReference,
    FixedIncomeState,
    FixedIncomeTitleFigures
} from '../domain/fixed-income-benchmark.types';

export interface FixedIncomeQuery {
    readonly holdingKey?: string;
    readonly asOf: string;
}

function referenceOf(windows: BenchmarkWindows): FixedIncomeReference {
    return {
        cdi12Bps: windows.cdi.windows.m12,
        cdiLastDate: windows.cdi.lastDate,
        cdiSource: windows.cdi.source,
        ipca12Bps: windows.ipca.windows.m12,
        ipcaLastDate: windows.ipca.lastDate,
        ipcaSource: windows.ipca.source
    };
}

function figuresOf(item: RealRateItem, index: number, reference: FixedIncomeReference): FixedIncomeTitleFigures {
    const nominal: number | null = item.nominalAnnualBps;
    return {
        key: `${TITLE_KEY_PREFIX}${String(index + 1)}`,
        kind: item.kind,
        indexer: item.indexer,
        rateBps: item.rateBps,
        appliedAt: item.appliedAt,
        nominalAnnualBps: nominal,
        realAnnualBps: item.realAnnualBps,
        beatsInflation: item.realAnnualBps === null ? null : item.realAnnualBps > 0,
        versusCdiBps: nominal === null || reference.cdi12Bps === null ? null : nominal - reference.cdi12Bps,
        estimated: item.estimated
    };
}

function emptyStateOf(reading: RealRatesReading): FixedIncomeState {
    return reading.rates.ipca12m === null ? FIXED_INCOME_STATES.noIndex : FIXED_INCOME_STATES.noTitles;
}

function listOf(reference: FixedIncomeReference, titles: readonly FixedIncomeTitleFigures[]): FixedIncomeComparison {
    return { state: FIXED_INCOME_STATES.list, reference, titles: titles.slice(0, MAX_LISTED_TITLES) };
}

function choiceOf(reference: FixedIncomeReference, titles: readonly FixedIncomeTitleFigures[], key: string): FixedIncomeComparison {
    const chosen: FixedIncomeTitleFigures | undefined = titles.find((title: FixedIncomeTitleFigures): boolean => title.key === key);
    return chosen === undefined
        ? { state: FIXED_INCOME_STATES.notFound, reference, titles: [] }
        : { state: FIXED_INCOME_STATES.ok, reference, titles: [chosen] };
}

@Injectable()
export class FixedIncomeBenchmarkService {
    public constructor(
        private readonly realRates: RealRatesReaderService,
        private readonly benchmarks: BenchmarkService
    ) {}

    public async compare(query: FixedIncomeQuery): Promise<FixedIncomeComparison> {
        const [reading, windows]: [RealRatesReading, BenchmarkWindows] = await Promise.all([
            this.realRates.readAll(),
            this.benchmarks.windows({ asOf: query.asOf })
        ]);
        const reference: FixedIncomeReference = referenceOf(windows);
        if (reading.items.length === 0) {
            return { state: emptyStateOf(reading), reference, titles: [] };
        }
        const titles: FixedIncomeTitleFigures[] = reading.items.map((item: RealRateItem, index: number): FixedIncomeTitleFigures =>
            figuresOf(item, index, reference)
        );
        return query.holdingKey === undefined ? listOf(reference, titles) : choiceOf(reference, titles, query.holdingKey);
    }
}
