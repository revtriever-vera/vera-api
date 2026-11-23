import { describe, expect, it } from 'vitest';
import { profileAmounts } from './amount-profile';
import { cleanDescription } from './merchant-key';
import { detectRecurring } from './recurring-detector';
import { DetectedSeries, DetectorTransaction } from './recurring.types';

interface Overrides {
    readonly accountId?: string;
    readonly counterpartyKey?: string | null;
    readonly categoryKey?: string | null;
    readonly categoryKind?: DetectorTransaction['categoryKind'];
    readonly dictionaryPattern?: string | null;
    readonly dictionaryCategory?: string | null;
    readonly installmentTotal?: number | null;
    readonly isSample?: boolean;
}

let sequence: number = 0;

function tx(date: string, reais: number, description: string, overrides: Overrides = {}): DetectorTransaction {
    sequence += 1;
    return {
        id: `t${String(sequence).padStart(4, '0')}`,
        accountId: overrides.accountId ?? 'nubank',
        date,
        amountMinor: Math.round(reais * 100),
        normalizedDescription: description,
        counterpartyKey: overrides.counterpartyKey ?? null,
        categoryKey: overrides.categoryKey ?? null,
        categoryKind: overrides.categoryKind ?? null,
        dictionaryPattern: overrides.dictionaryPattern ?? null,
        dictionaryCategory: overrides.dictionaryCategory ?? null,
        installmentTotal: overrides.installmentTotal ?? null,
        isSample: overrides.isSample ?? false
    };
}

function monthly(dates: readonly string[], reais: number, description: string, overrides: Overrides = {}): DetectorTransaction[] {
    return dates.map((date: string): DetectorTransaction => tx(date, -reais, description, overrides));
}

const NETFLIX: Overrides = { dictionaryPattern: 'NETFLIX', dictionaryCategory: 'subscriptions', categoryKey: 'subscriptions' };
const FIVE_MONTHS: readonly string[] = ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'];

function only(series: readonly DetectedSeries[]): DetectedSeries {
    expect(series).toHaveLength(1);
    return series[0] as DetectedSeries;
}

describe('detectRecurring', () => {
    it('detects a fixed monthly subscription (Netflix)', () => {
        const series: DetectedSeries = only(detectRecurring(monthly(FIVE_MONTHS, 44.9, 'NETFLIX.COM', NETFLIX)));

        expect(series).toMatchObject({
            merchantKey: 'NETFLIX',
            cadence: 'monthly',
            valueMode: 'fixed',
            typicalAmountMinor: 4490,
            expectedDay: 5,
            dayChange: null,
            knownSubscription: true,
            categoryKey: 'subscriptions'
        });
        expect(series.chargeIds).toHaveLength(5);
    });

    it('turns two plans of the same service into two series', () => {
        const basic: DetectorTransaction[] = monthly(FIVE_MONTHS, 21.9, 'SPOTIFY', { dictionaryPattern: 'SPOTIFY' });
        const family: DetectorTransaction[] = monthly(FIVE_MONTHS, 34.9, 'SPOTIFY', { dictionaryPattern: 'SPOTIFY' });

        const series: readonly DetectedSeries[] = detectRecurring([...basic, ...family]);

        expect(series.map((item: DetectedSeries): number => item.typicalAmountMinor)).toEqual([2190, 3490]);
    });

    it('detects a variable utility bill (luz)', () => {
        const amounts: readonly number[] = [150, 182, 171, 198, 160];
        const charges: DetectorTransaction[] = FIVE_MONTHS.map((date: string, index: number): DetectorTransaction =>
            tx(date.replace('-05', '-10'), -(amounts[index] ?? 0), 'ENEL DISTRIBUICAO', { categoryKey: 'home_services' })
        );

        const series: DetectedSeries = only(detectRecurring(charges));

        expect(series).toMatchObject({
            valueMode: 'variable',
            cadence: 'monthly',
            expectedDay: 10,
            minAmountMinor: 15000,
            maxAmountMinor: 19800
        });
        expect(series.typicalAmountMinor).toBe(Math.round(((171 + 198 + 160) / 3) * 100));
    });

    it('anchors a gym that moves from day 5 to day 12', () => {
        const dates: readonly string[] = ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-12', '2026-10-12'];

        const series: DetectedSeries = only(detectRecurring(monthly(dates, 99.9, 'SMART FIT ACADEMIA', { categoryKey: 'health' })));

        expect(series.expectedDay).toBe(12);
        expect(series.dayChange).toEqual({ fromDay: 5, toDay: 12 });
        expect(series.chargeIds).toHaveLength(5);
    });

    it('keeps the day inside the tolerance of 4 days without re-anchoring', () => {
        const dates: readonly string[] = ['2026-07-05', '2026-08-08', '2026-09-04', '2026-10-06'];

        const series: DetectedSeries = only(detectRecurring(monthly(dates, 59.9, 'PLANO SAUDE X', { categoryKey: 'health' })));

        expect(series.dayChange).toBeNull();
        expect(series.expectedDay).toBe(6);
    });

    it('clamps day 31 to the last day of shorter months', () => {
        const dates: readonly string[] = ['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30'];

        const series: DetectedSeries = only(detectRecurring(monthly(dates, 80, 'CONDOMINIO RESIDENCIAL', { categoryKey: 'housing' })));

        expect(series.expectedDay).toBe(31);
        expect(series.dayChange).toBeNull();
    });

    it('detects an annual insurance with two charges', () => {
        const charges: DetectorTransaction[] = [
            tx('2025-10-20', -389, 'PORTO SEGURO AUTO', { categoryKey: 'other_expenses' }),
            tx('2026-10-20', -389, 'PORTO SEGURO AUTO', { categoryKey: 'other_expenses' })
        ];

        expect(only(detectRecurring(charges))).toMatchObject({ cadence: 'annual', valueMode: 'fixed', expectedDay: 20 });
    });

    it('does not turn weekly groceries with varying values into a series', () => {
        const values: readonly number[] = [182, 231, 154, 212, 198, 167];
        const charges: DetectorTransaction[] = values.map((value: number, index: number): DetectorTransaction =>
            tx(`2026-10-${String(2 + index * 7).padStart(2, '0')}`, -value, 'SUPERMERCADO BH', { categoryKey: 'groceries' })
        );

        expect(detectRecurring(charges)).toEqual([]);
    });

    it('accepts a fixed-value weekly series even in a consumption category', () => {
        const dates: readonly string[] = ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'];

        expect(only(detectRecurring(monthly(dates, 25, 'FEIRA ORGANICA', { categoryKey: 'groceries' }))).cadence).toBe('weekly');
    });

    it('does not turn Uber rides into a series', () => {
        const rides: readonly [string, number][] = [
            ['2026-09-03', 18.5],
            ['2026-09-04', 32.1],
            ['2026-09-19', 12.9],
            ['2026-10-02', 45.7],
            ['2026-10-02', 16.2],
            ['2026-10-25', 27.3]
        ];
        const charges: DetectorTransaction[] = rides.map(([date, value]: readonly [string, number]): DetectorTransaction =>
            tx(date, -value, 'UBER TRIP', { dictionaryPattern: 'UBER', categoryKey: 'transport' })
        );

        expect(detectRecurring(charges)).toEqual([]);
    });

    it('leaves installments out', () => {
        const charges: DetectorTransaction[] = monthly(['2026-09-10', '2026-10-10', '2026-11-10'], 150, 'LOJA ELETRO PARC', {
            installmentTotal: 10,
            categoryKey: 'shopping'
        });

        expect(detectRecurring(charges)).toEqual([]);
    });

    it('leaves a transfer between own accounts out (mirror)', () => {
        const dates: readonly string[] = ['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'];
        const out: DetectorTransaction[] = monthly(dates, 500, 'TRANSF ENVIADA JOAO', { accountId: 'nubank' });
        const incoming: DetectorTransaction[] = dates.map((date: string): DetectorTransaction =>
            tx(date, 500, 'TRANSF RECEBIDA JOAO', { accountId: 'itau' })
        );

        expect(detectRecurring([...out, ...incoming])).toEqual([]);
    });

    it('matches the mirror with one day of difference', () => {
        const out: DetectorTransaction[] = monthly(['2026-08-05', '2026-09-05', '2026-10-05'], 500, 'PIX MESMO TITULAR', {
            accountId: 'nubank'
        });
        const incoming: DetectorTransaction[] = ['2026-08-06', '2026-09-06', '2026-10-06'].map((date: string): DetectorTransaction =>
            tx(date, 500, 'PIX RECEBIDO', { accountId: 'itau' })
        );

        expect(detectRecurring([...out, ...incoming])).toEqual([]);
    });

    it('leaves out categories of kind transfer', () => {
        const charges: DetectorTransaction[] = monthly(FIVE_MONTHS, 300, 'PAGAMENTO FATURA', {
            categoryKind: 'transfer',
            categoryKey: 'card_payment'
        });

        expect(detectRecurring(charges)).toEqual([]);
    });

    it('does not let a refund count as a charge and keeps the remaining series', () => {
        const dates: readonly string[] = ['2026-06-12', '2026-07-12', '2026-08-12', '2026-09-12'];
        const charges: DetectorTransaction[] = monthly(dates, 29.9, 'APPLE.COM/BILL', { counterpartyKey: 'apple' });
        const refunded: DetectorTransaction | undefined = charges[1];
        const refund: DetectorTransaction = tx('2026-07-17', 29.9, 'APPLE.COM/BILL ESTORNO', { counterpartyKey: 'apple' });

        const series: DetectedSeries = only(detectRecurring([...charges, refund]));

        expect(series.chargeIds).not.toContain(refunded?.id);
        expect(series.chargeIds).toHaveLength(3);
        expect(series.cadence).toBe('monthly');
    });

    it('drops a series that is left with too few charges after a refund', () => {
        const charges: DetectorTransaction[] = monthly(['2026-08-12', '2026-09-12', '2026-10-12'], 29.9, 'APPLE.COM/BILL', {
            counterpartyKey: 'apple'
        });
        const refund: DetectorTransaction = tx('2026-09-20', 29.9, 'ESTORNO', { counterpartyKey: 'apple' });

        expect(detectRecurring([...charges, refund])).toEqual([]);
    });

    it('does not treat a late refund as an annulment', () => {
        const charges: DetectorTransaction[] = monthly(['2026-08-12', '2026-09-12', '2026-10-12'], 29.9, 'APPLE.COM/BILL', {
            counterpartyKey: 'apple'
        });
        const refund: DetectorTransaction = tx('2026-09-30', 29.9, 'ESTORNO', { counterpartyKey: 'apple' });

        expect(only(detectRecurring([...charges, refund])).chargeIds).toHaveLength(3);
    });

    it('sends a second charge in the same month to the duplicates', () => {
        const charges: DetectorTransaction[] = monthly(['2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'], 21.9, 'SPOTIFY', {
            dictionaryPattern: 'SPOTIFY'
        });
        const again: DetectorTransaction = tx('2026-10-05', -21.9, 'SPOTIFY', { dictionaryPattern: 'SPOTIFY' });

        const series: DetectedSeries = only(detectRecurring([...charges, again]));

        expect(series.duplicateChargeIds).toEqual([again.id]);
        expect(series.chargeIds).toHaveLength(4);
        expect(series.cadence).toBe('monthly');
    });

    it('keeps the same subscription in two cards as two series', () => {
        const nubank: DetectorTransaction[] = monthly(['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'], 44.9, 'NETFLIX.COM', {
            ...NETFLIX,
            accountId: 'nubank'
        });
        const itau: DetectorTransaction[] = monthly(['2026-07-06', '2026-08-06', '2026-09-06', '2026-10-06'], 44.9, 'NETFLIX.COM', {
            ...NETFLIX,
            accountId: 'itau'
        });

        const series: readonly DetectedSeries[] = detectRecurring([...nubank, ...itau]);

        expect(series.map((item: DetectedSeries): string => item.accountId)).toEqual(['itau', 'nubank']);
        expect(series.every((item: DetectedSeries): boolean => item.chargeIds.length === 4)).toBe(true);
    });

    it('keeps one series when the subscription moves to another card', () => {
        const before: DetectorTransaction[] = monthly(['2026-07-05', '2026-08-05'], 44.9, 'NETFLIX.COM', {
            ...NETFLIX,
            accountId: 'nubank'
        });
        const after: DetectorTransaction[] = monthly(['2026-09-05', '2026-10-05'], 44.9, 'NETFLIX.COM', { ...NETFLIX, accountId: 'itau' });

        const series: DetectedSeries = only(detectRecurring([...before, ...after]));

        expect(series.accountIds).toEqual(['itau', 'nubank']);
        expect(series.accountId).toBe('itau');
    });

    it('links a one-real trial to the series that follows', () => {
        const trial: DetectorTransaction = tx('2026-09-01', -1, 'STREAMING PLUS', { counterpartyKey: 'streamingplus' });
        const paid: DetectorTransaction[] = monthly(['2026-10-01', '2026-11-01', '2026-12-01'], 39.9, 'STREAMING PLUS', {
            counterpartyKey: 'streamingplus'
        });

        const series: DetectedSeries = only(detectRecurring([trial, ...paid]));

        expect(series.trialChargeIds).toEqual([trial.id]);
        expect(series.chargeIds).not.toContain(trial.id);
        expect(series.typicalAmountMinor).toBe(3990);
    });

    it('suggests a monthly Pix rent to a person as a bill', () => {
        const charges: DetectorTransaction[] = monthly(['2026-09-08', '2026-10-08', '2026-11-08'], 1500, 'PIX ENVIADO MARIA SOUZA', {
            counterpartyKey: 'maria souza',
            categoryKey: 'housing'
        });

        expect(only(detectRecurring(charges))).toMatchObject({
            merchantKey: 'maria souza',
            cadence: 'monthly',
            valueMode: 'fixed',
            categoryKey: 'housing'
        });
    });
});

describe('detectRecurring thresholds', () => {
    it('requires three charges for a monthly series', () => {
        expect(detectRecurring(monthly(['2026-09-08', '2026-10-08'], 120, 'CLUBE DE VINHOS'))).toEqual([]);
    });

    it('accepts two charges for a known subscription', () => {
        const charges: DetectorTransaction[] = monthly(['2026-10-08', '2026-11-08'], 19.9, 'SPOTIFY', {
            dictionaryPattern: 'SPOTIFY',
            dictionaryCategory: 'subscriptions'
        });

        expect(only(detectRecurring(charges)).cadence).toBe('monthly');
    });

    it('accepts one missing charge but not two', () => {
        const oneMissing: readonly string[] = ['2026-05-10', '2026-06-10', '2026-08-10', '2026-09-10', '2026-10-10'];
        const twoMissing: readonly string[] = ['2026-04-10', '2026-06-10', '2026-08-10', '2026-09-10', '2026-10-10'];

        expect(only(detectRecurring(monthly(oneMissing, 70, 'CLUBE X ASSINATURA'))).chargeIds).toHaveLength(5);
        expect(only(detectRecurring(monthly(twoMissing, 70, 'CLUBE Y ASSINATURA'))).chargeIds).toHaveLength(4);
    });

    it('marks a price step in the last charge as fixed', () => {
        const prices: readonly number[] = [44.9, 44.9, 44.9, 49.9];
        const charges: DetectorTransaction[] = ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'].map(
            (date: string, index: number): DetectorTransaction => tx(date, -(prices[index] ?? 0), 'NETFLIX.COM', NETFLIX)
        );

        expect(only(detectRecurring(charges))).toMatchObject({ valueMode: 'fixed', typicalAmountMinor: 4990 });
    });

    it('ignores sample data when the company has real data', () => {
        const samples: DetectorTransaction[] = monthly(FIVE_MONTHS, 44.9, 'NETFLIX.COM', { ...NETFLIX, isSample: true });
        const real: DetectorTransaction[] = [tx('2026-11-20', -12, 'PADARIA DO BAIRRO')];

        expect(detectRecurring([...samples, ...real])).toEqual([]);
    });

    it('keeps sample data when there is nothing else', () => {
        expect(detectRecurring(monthly(FIVE_MONTHS, 44.9, 'NETFLIX.COM', { ...NETFLIX, isSample: true }))).toHaveLength(1);
    });

    it('ignores incoming money and charges without a usable key', () => {
        const income: DetectorTransaction[] = FIVE_MONTHS.map((date: string): DetectorTransaction => tx(date, 5000, 'SALARIO EMPRESA'));
        const keyless: DetectorTransaction[] = monthly(FIVE_MONTHS, 30, '12 34');

        expect(detectRecurring([...income, ...keyless])).toEqual([]);
    });

    it('does not mutate the input', () => {
        const input: readonly DetectorTransaction[] = [...monthly(FIVE_MONTHS, 44.9, 'NETFLIX.COM', NETFLIX)].reverse();
        const snapshot: string = JSON.stringify(input);

        detectRecurring(input);

        expect(JSON.stringify(input)).toBe(snapshot);
    });
});

describe('cleanDescription', () => {
    it('removes numbers, asterisks and city and country suffixes', () => {
        expect(cleanDescription('AMZN MKTP *2K4LL9 SAO PAULO BR')).toBe('AMZN MKTP K LL');
    });

    it('returns null below three characters', () => {
        expect(cleanDescription('A1 22')).toBeNull();
    });
});

describe('profileAmounts', () => {
    it('refuses a spread above 35%', () => {
        expect(profileAmounts([8000, 12000, 10000, 8000, 12000])).toBeNull();
    });

    it('accepts a fixed value within R$ 2', () => {
        expect(profileAmounts([1000, 1100, 1190])).toMatchObject({ mode: 'fixed', typicalAmountMinor: 1190 });
    });

    it('averages the last three of a variable series', () => {
        expect(profileAmounts([10000, 11000, 12000, 9000])).toMatchObject({ mode: 'variable', typicalAmountMinor: 10667 });
    });
});
