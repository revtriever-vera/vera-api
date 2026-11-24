import { describe, expect, it } from 'vitest';
import { chargesOfTransactions, deriveAlerts } from './recurring-alerts';
import { AlertCharge, AlertSeries, DesiredAlert } from './recurring-alerts.types';
import { DetectorTransaction } from './recurring.types';

const TODAY: string = '2026-11-23';

function charge(id: string, date: string, amountMinor: number, overrides: Partial<AlertCharge> = {}): AlertCharge {
    return { id, date, amountMinor, accountId: 'nubank', merchantKey: 'NETFLIX', ...overrides };
}

function series(chargeIds: readonly string[], overrides: Partial<AlertSeries> = {}): AlertSeries {
    return {
        id: 's1',
        merchantKey: 'NETFLIX',
        accountId: 'nubank',
        cadence: 'monthly',
        status: 'confirmed',
        stoppedBy: null,
        stoppedOn: null,
        expectedDay: 5,
        typicalAmountMinor: 4490,
        chargeIds,
        duplicateIds: [],
        trialIds: [],
        ...overrides
    };
}

const MONTHLY: readonly AlertCharge[] = [
    charge('c1', '2026-07-05', 4490),
    charge('c2', '2026-08-05', 4490),
    charge('c3', '2026-09-05', 4490),
    charge('c4', '2026-10-05', 4490)
];

function kinds(alerts: readonly DesiredAlert[]): string[] {
    return alerts.map((alert: DesiredAlert): string => alert.kind);
}

describe('aumento de preço', () => {
    it('junta a série antiga com a cobrança nova de outra faixa: de R$ 44,90 para R$ 55,90 é +24%', () => {
        const next: AlertCharge = charge('f1', '2026-11-05', 5590);

        const alerts: DesiredAlert[] = deriveAlerts([series(['c1', 'c2', 'c3', 'c4'])], [...MONTHLY, next], TODAY);

        expect(alerts).toEqual([
            {
                seriesId: 's1',
                kind: 'price_increase',
                fingerprint: 'f1',
                occurredOn: '2026-11-05',
                data: { fromAmountMinor: 4490, toAmountMinor: 5590, percent: 24, chargeDate: '2026-11-05' }
            }
        ]);
    });

    it('alerta o aumento de qualquer tamanho, também o de 100%', () => {
        const alerts: DesiredAlert[] = deriveAlerts(
            [series(['c1', 'c2', 'c3', 'c4'])],
            [...MONTHLY, charge('f1', '2026-11-06', 8980)],
            TODAY
        );

        expect(alerts[0]?.data).toMatchObject({ percent: 100 });
    });

    it('alerta o aumento dentro da mesma faixa quando a última cobrança sobe', () => {
        const rise: AlertCharge = charge('c5', '2026-11-05', 4990);

        const alerts: DesiredAlert[] = deriveAlerts([series(['c1', 'c2', 'c3', 'c4', 'c5'])], [...MONTHLY, rise], TODAY);

        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({
            kind: 'price_increase',
            fingerprint: 'c5',
            data: { fromAmountMinor: 4490, toAmountMinor: 4990, percent: 11 }
        });
    });

    it('some na segunda cobrança com o preço novo, mesmo recente', () => {
        const charges: AlertCharge[] = [...MONTHLY, charge('c5', '2026-11-05', 4990), charge('c6', '2026-12-05', 4990)];

        expect(deriveAlerts([series(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])], charges, '2026-12-10')).toEqual([]);
    });

    it('um novo aumento depois da série estabilizar gera alerta novo', () => {
        const charges: AlertCharge[] = [
            ...MONTHLY,
            charge('c5', '2026-11-05', 4990),
            charge('c6', '2026-12-05', 4990),
            charge('c7', '2027-01-05', 4990),
            charge('c8', '2027-02-05', 5990)
        ];

        const alerts: DesiredAlert[] = deriveAlerts([series(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'])], charges, '2027-02-10');

        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ fingerprint: 'c8', data: { fromAmountMinor: 4990, toAmountMinor: 5990 } });
    });

    it('com duas cobranças soltas no valor novo não alerta mais', () => {
        const charges: AlertCharge[] = [...MONTHLY, charge('f1', '2026-11-05', 5590), charge('f2', '2026-12-05', 5590)];

        expect(deriveAlerts([series(['c1', 'c2', 'c3', 'c4'])], charges, '2026-12-10')).toEqual([]);
    });

    it('ignora a diferença abaixo de max(R$ 1, 5%)', () => {
        const charges: AlertCharge[] = [...MONTHLY, charge('c5', '2026-11-05', 4540)];

        expect(deriveAlerts([series(['c1', 'c2', 'c3', 'c4', 'c5'])], charges, TODAY)).toEqual([]);
    });

    it('não junta uma compra solta fora do ciclo nem fora do dia esperado', () => {
        const early: AlertCharge = charge('f1', '2026-10-15', 9900);
        const wrongDay: AlertCharge = charge('f2', '2026-11-20', 9900);

        expect(deriveAlerts([series(['c1', 'c2', 'c3', 'c4'])], [...MONTHLY, early], TODAY)).toEqual([]);
        expect(deriveAlerts([series(['c1', 'c2', 'c3', 'c4'])], [...MONTHLY, wrongDay], TODAY)).toEqual([]);
    });

    it('não alerta quando o valor anterior já variava', () => {
        const wobbly: AlertCharge[] = [
            charge('c1', '2026-07-05', 3000),
            charge('c2', '2026-08-05', 4400),
            charge('c3', '2026-09-05', 3500),
            charge('c4', '2026-10-05', 4490),
            charge('c5', '2026-11-05', 5200)
        ];

        expect(deriveAlerts([series(['c1', 'c2', 'c3', 'c4', 'c5'])], wobbly, TODAY)).toEqual([]);
    });

    it('na anual compara com a cobrança do ano anterior', () => {
        const yearly: AlertCharge[] = [charge('a1', '2025-10-10', 23900), charge('a2', '2026-10-10', 29900)];

        const alerts: DesiredAlert[] = deriveAlerts([series(['a1', 'a2'], { cadence: 'annual', expectedDay: 10 })], yearly, TODAY);

        expect(alerts[0]).toMatchObject({ kind: 'price_increase', fingerprint: 'a2', data: { fromAmountMinor: 23900, percent: 25 } });
    });

    it('não alerta o aumento antigo, de mais de 90 dias', () => {
        expect(deriveAlerts([series(['c1', 'c2', 'c3', 'c4'])], [...MONTHLY, charge('f1', '2026-11-05', 5590)], '2027-03-01')).toEqual([]);
    });

    it('não alerta série descartada nem parada', () => {
        const next: AlertCharge = charge('f1', '2026-11-05', 5590);

        expect(deriveAlerts([series(['c1', 'c2', 'c3', 'c4'], { status: 'dismissed' })], [...MONTHLY, next], TODAY)).toEqual([]);
        expect(
            deriveAlerts([series(['c1', 'c2', 'c3', 'c4'], { status: 'stopped', stoppedBy: 'auto' })], [...MONTHLY, next], TODAY)
        ).toEqual([]);
    });
});

describe('cobrança duplicada', () => {
    it('avisa o débito repetido no mesmo ciclo com as duas datas e valores', () => {
        const charges: AlertCharge[] = [...MONTHLY, charge('d1', '2026-10-07', 4490)];

        const alerts: DesiredAlert[] = deriveAlerts([series(['c1', 'c2', 'c3', 'c4'], { duplicateIds: ['d1'] })], charges, TODAY);

        expect(alerts).toEqual([
            {
                seriesId: 's1',
                kind: 'duplicate_charge',
                fingerprint: 'd1',
                occurredOn: '2026-10-07',
                data: { firstDate: '2026-10-05', firstAmountMinor: 4490, secondDate: '2026-10-07', secondAmountMinor: 4490 }
            }
        ]);
    });

    it('avisa a mesma assinatura em duas contas, uma vez só, na série de menor id', () => {
        const second: AlertSeries = series(['b1'], { id: 's2', accountId: 'itau', typicalAmountMinor: 4900 });
        const charges: AlertCharge[] = [...MONTHLY, charge('b1', '2026-10-06', 4900, { accountId: 'itau' })];

        const alerts: DesiredAlert[] = deriveAlerts([series(['c1', 'c2', 'c3', 'c4']), second], charges, TODAY);

        expect(kinds(alerts)).toEqual(['duplicate_account']);
        expect(alerts[0]).toMatchObject({
            seriesId: 's1',
            fingerprint: 's2',
            occurredOn: '2026-10-06',
            data: { accountId: 'nubank', otherAccountId: 'itau' }
        });
    });

    it('não confunde duas contas com valores distantes ou no mesmo cartão', () => {
        const far: AlertSeries = series([], { id: 's2', accountId: 'itau', typicalAmountMinor: 9000 });
        const same: AlertSeries = series([], { id: 's3', typicalAmountMinor: 4490 });

        expect(deriveAlerts([series([]), far, same], [], TODAY)).toEqual([]);
    });
});

describe('teste que virou cobrança', () => {
    it('avisa quando a primeira cobrança cheia vem depois das de até R$ 1', () => {
        const charges: AlertCharge[] = [charge('t1', '2026-09-20', 100), ...MONTHLY.slice(3)];

        const alerts: DesiredAlert[] = deriveAlerts([series(['c4'], { trialIds: ['t1'] })], charges, TODAY);

        expect(alerts).toEqual([
            {
                seriesId: 's1',
                kind: 'trial_converted',
                fingerprint: 'c4',
                occurredOn: '2026-10-05',
                data: { trialAmountMinor: 100, firstAmountMinor: 4490, chargeDate: '2026-10-05' }
            }
        ]);
    });
});

describe('voltou a cobrar', () => {
    const stopped: AlertSeries = series(['c1', 'c2'], { status: 'stopped', stoppedBy: 'user', stoppedOn: '2026-08-20' });

    it('avisa a cobrança depois de 60 dias ou mais da última antes do "Cancelei"', () => {
        const charges: AlertCharge[] = [...MONTHLY.slice(0, 2), charge('r1', '2026-10-25', 4490)];

        const alerts: DesiredAlert[] = deriveAlerts([stopped], charges, TODAY);

        expect(alerts).toEqual([
            {
                seriesId: 's1',
                kind: 'returned',
                fingerprint: 'r1',
                occurredOn: '2026-10-25',
                data: { lastDate: '2026-08-05', returnDate: '2026-10-25', amountMinor: 4490, gapDays: 81 }
            }
        ]);
    });

    it('não avisa a cobrança que ainda cabe no ciclo, a parada pela Vera nem a de outro valor', () => {
        const soon: AlertCharge[] = [...MONTHLY.slice(0, 2), charge('r1', '2026-09-04', 4490)];
        const other: AlertCharge[] = [...MONTHLY.slice(0, 2), charge('r1', '2026-10-25', 12000)];
        const auto: AlertSeries = { ...stopped, stoppedBy: 'auto' };

        expect(deriveAlerts([stopped], soon, TODAY)).toEqual([]);
        expect(deriveAlerts([stopped], other, TODAY)).toEqual([]);
        expect(deriveAlerts([auto], [...MONTHLY.slice(0, 2), charge('r1', '2026-10-25', 4490)], TODAY)).toEqual([]);
    });

    it('não conta como volta a cobrança que pertence a outra série', () => {
        const owner: AlertSeries = series(['r1'], { id: 's9' });
        const charges: AlertCharge[] = [...MONTHLY.slice(0, 2), charge('r1', '2026-10-25', 4490)];

        expect(deriveAlerts([stopped, owner], charges, TODAY).filter((alert: DesiredAlert): boolean => alert.kind === 'returned')).toEqual(
            []
        );
    });
});

describe('chargesOfTransactions', () => {
    function transaction(id: string, amountMinor: number, overrides: Partial<DetectorTransaction> = {}): DetectorTransaction {
        return {
            id,
            accountId: 'nubank',
            date: '2026-10-05',
            amountMinor,
            normalizedDescription: 'NETFLIX COM',
            counterpartyKey: null,
            categoryKey: null,
            categoryKind: 'expense',
            dictionaryPattern: 'NETFLIX',
            dictionaryCategory: 'subscriptions',
            installmentTotal: null,
            isSample: false,
            ...overrides
        };
    }

    it('vira cobrança positiva com a chave do estabelecimento e deixa de fora entrada e parcela', () => {
        const found: AlertCharge[] = chargesOfTransactions([
            transaction('a', -4490),
            transaction('b', 7000),
            transaction('c', -4490, { installmentTotal: 10 })
        ]);

        expect(found).toEqual([{ id: 'a', date: '2026-10-05', amountMinor: 4490, accountId: 'nubank', merchantKey: 'NETFLIX' }]);
    });
});
