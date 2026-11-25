import { describe, expect, it } from 'vitest';
import { seriesUntil } from '../../../../../test/support/reference-curve-series';
import { DecimalUtil } from '../../../../shared/utils/decimal.util';
import { CurveSeries } from '../../../fixed-income/services/index-series-math';
import { INFERENCE_REASONS, inferRate, RateInference, RateInferenceInput } from './rate-inference';

const POSITION_DATE: string = '2026-10-30';
const MAX_CDI_DATE: string = '2026-10-29';

const SERIES: CurveSeries = seriesUntil(MAX_CDI_DATE, '2026-09');

function inputOf(overrides: Partial<RateInferenceInput>): RateInferenceInput {
    return {
        indexer: 'DI',
        issueDate: '2024-03-15',
        positionDate: POSITION_DATE,
        issueUnitPrice: '1000',
        curveUnitPrice: '1458.65',
        series: SERIES,
        ...overrides
    };
}

function rateOf(result: RateInference): number {
    if (!result.found) {
        throw new Error(`no rate: ${result.reason}`);
    }
    return result.rateBps;
}

function reasonOf(result: RateInference): string {
    if (result.found) {
        throw new Error('rate found');
    }
    return result.reason;
}

describe('inferRate: amostras de taxa conhecida', () => {
    it('DI: 112% do CDI com erro de até 0,1 p.p.', () => {
        const result: RateInference = inferRate(inputOf({}));

        expect(result).toMatchObject({ found: true, indexer: 'cdi_percent' });
        expect(Math.abs(rateOf(result) - 11200)).toBeLessThanOrEqual(10);
    });

    it('DI: 105% do CDI com aplicação em data diferente da emissão', () => {
        const result: RateInference = inferRate(inputOf({ issueDate: '2024-02-01', curveUnitPrice: '1443.94' }));

        expect(Math.abs(rateOf(result) - 10500)).toBeLessThanOrEqual(10);
    });

    it('DI: 100% do CDI na carência', () => {
        const result: RateInference = inferRate(inputOf({ issueDate: '2026-05-04', curveUnitPrice: '1070.69' }));

        expect(Math.abs(rateOf(result) - 10000)).toBeLessThanOrEqual(10);
    });

    it('IPCA: spread de 6,5% com erro de até 0,02 p.p.', () => {
        const result: RateInference = inferRate(inputOf({ indexer: 'IPCA', issueDate: '2023-08-10', curveUnitPrice: '1412.72' }));

        expect(result).toMatchObject({ found: true, indexer: 'ipca_plus', estimated: false });
        expect(Math.abs(rateOf(result) - 650)).toBeLessThanOrEqual(2);
    });

    it('PRE: 12,3% ao ano com erro de até 0,02 p.p.', () => {
        const result: RateInference = inferRate(inputOf({ indexer: 'PRE', issueDate: '2025-01-20', curveUnitPrice: '1238.12' }));

        expect(result).toMatchObject({ found: true, indexer: 'prefixed' });
        expect(Math.abs(rateOf(result) - 1230)).toBeLessThanOrEqual(2);
    });

    it('usa o preço de emissão da planilha em vez da face', () => {
        const result: RateInference = inferRate(inputOf({ issueUnitPrice: '2000', curveUnitPrice: '2917.3' }));

        expect(Math.abs(rateOf(result) - 11200)).toBeLessThanOrEqual(10);
    });
});

describe('inferRate: sem cálculo', () => {
    it('poucos dias desde a emissão', () => {
        const result: RateInference = inferRate(inputOf({ issueDate: '2026-10-20', curveUnitPrice: '1003.5' }));

        expect(reasonOf(result)).toBe(INFERENCE_REASONS.tooRecent);
    });

    it.each([
        ['sem indexador', { indexer: null }],
        ['indexador fora de DI, IPCA e PRE', { indexer: 'SELIC' }],
        ['sem CURVA', { curveUnitPrice: null }],
        ['sem preço de emissão', { issueUnitPrice: null }],
        ['sem data de emissão', { issueDate: null }],
        ['emissão depois da posição', { issueDate: '2026-11-02' }]
    ])('%s', (_name: string, overrides: Partial<RateInferenceInput>) => {
        expect(reasonOf(inferRate(inputOf(overrides)))).toBe(INFERENCE_REASONS.missingData);
    });

    it('taxa fora da faixa plausível', () => {
        expect(reasonOf(inferRate(inputOf({ curveUnitPrice: '3000' })))).toBe(INFERENCE_REASONS.implausible);
        expect(reasonOf(inferRate(inputOf({ curveUnitPrice: '1100' })))).toBe(INFERENCE_REASONS.implausible);
        expect(reasonOf(inferRate(inputOf({ indexer: 'PRE', issueDate: '2025-01-20', curveUnitPrice: '5000' })))).toBe(
            INFERENCE_REASONS.implausible
        );
    });

    it('série de CDI sem cobertura do período', () => {
        const stale: CurveSeries = seriesUntil('2026-06-30', '2026-09');

        expect(reasonOf(inferRate(inputOf({ series: stale })))).toBe(INFERENCE_REASONS.missingSeries);
    });

    it('série de IPCA sem cobertura do período', () => {
        const noRecentIpca: CurveSeries = seriesUntil(MAX_CDI_DATE, '2026-06');
        const noEarlyIpca: CurveSeries = { ...SERIES, ipca: { months: ['2024-01'], values: [DecimalUtil.of('0.4')] } };
        const input: RateInferenceInput = inputOf({ indexer: 'IPCA', issueDate: '2023-08-10', curveUnitPrice: '1412.72' });

        expect(reasonOf(inferRate({ ...input, series: noRecentIpca }))).toBe(INFERENCE_REASONS.missingSeries);
        expect(reasonOf(inferRate({ ...input, series: noEarlyIpca }))).toBe(INFERENCE_REASONS.missingSeries);
    });
});
