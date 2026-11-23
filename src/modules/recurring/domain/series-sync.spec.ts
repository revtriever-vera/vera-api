import { describe, expect, it } from 'vitest';
import { StoredCharge, StoredSeries } from './recurring-series.types';
import { desiredChargesOf, detectedFieldsOf, diffCharges, isSuppressed, matchStored, planSync } from './series-sync';
import { DetectedSeries } from './recurring.types';

const TODAY: string = '2026-11-23';

function detected(overrides: Partial<DetectedSeries> = {}): DetectedSeries {
    return {
        merchantKey: 'NETFLIX',
        cadence: 'monthly',
        valueMode: 'fixed',
        typicalAmountMinor: 5590,
        minAmountMinor: 5590,
        maxAmountMinor: 5590,
        expectedDay: 5,
        dayChange: null,
        chargeIds: ['t1', 't2', 't3'],
        duplicateChargeIds: ['d1'],
        trialChargeIds: ['r1'],
        accountId: 'nubank',
        accountIds: ['nubank'],
        categoryKey: 'subscriptions',
        knownSubscription: true,
        firstDate: '2026-09-05',
        lastDate: '2026-11-05',
        ...overrides
    };
}

function stored(overrides: Partial<StoredSeries> = {}): StoredSeries {
    return {
        id: 's1',
        status: 'suggested',
        merchantKey: 'NETFLIX',
        accountId: 'nubank',
        cadence: 'monthly',
        typicalAmountMinor: 5590,
        lastDate: '2026-11-05',
        stoppedBy: null,
        chargeIds: new Set<string>(['t1', 't2']),
        ...overrides
    };
}

describe('matchStored', () => {
    it('prefere a série que divide mais cobranças', () => {
        const other: StoredSeries = stored({ id: 's2', chargeIds: new Set<string>(['t1', 't2', 't3']) });

        expect(matchStored(detected(), [stored(), other])?.id).toBe('s2');
    });

    it('sem cobranças em comum casa por chave, conta e faixa de valor, e escolhe o valor mais próximo', () => {
        const far: StoredSeries = stored({ id: 'far', chargeIds: new Set<string>(), typicalAmountMinor: 6500 });
        const near: StoredSeries = stored({ id: 'near', chargeIds: new Set<string>(), typicalAmountMinor: 5600 });

        expect(matchStored(detected(), [far, near])?.id).toBe('near');
    });

    it('não casa outra conta, outro estabelecimento nem outra faixa', () => {
        const candidates: StoredSeries[] = [
            stored({ id: 'a', chargeIds: new Set<string>(), accountId: 'itau' }),
            stored({ id: 'b', chargeIds: new Set<string>(), merchantKey: 'SPOTIFY' }),
            stored({ id: 'c', chargeIds: new Set<string>(), typicalAmountMinor: 2190 })
        ];

        expect(matchStored(detected(), candidates)).toBeNull();
    });
});

describe('isSuppressed', () => {
    it('suprime o mesmo estabelecimento na faixa de valor e libera outro plano', () => {
        const suppressions = [{ merchantKey: 'SPOTIFY', typicalAmountMinor: 2190 }];

        expect(isSuppressed(detected({ merchantKey: 'SPOTIFY', typicalAmountMinor: 2290 }), suppressions)).toBe(true);
        expect(isSuppressed(detected({ merchantKey: 'SPOTIFY', typicalAmountMinor: 3490 }), suppressions)).toBe(false);
        expect(isSuppressed(detected(), suppressions)).toBe(false);
    });
});

describe('planSync', () => {
    it('cria sugestão para o que é novo e respeita a supressão', () => {
        const fresh: DetectedSeries = detected({ merchantKey: 'SPOTIFY', typicalAmountMinor: 2190 });
        const hidden: DetectedSeries = detected({ merchantKey: 'ACADEMIA', typicalAmountMinor: 9000 });

        const actions = planSync([fresh, hidden], [], [{ merchantKey: 'ACADEMIA', typicalAmountMinor: 9000 }], TODAY);

        expect(actions).toEqual([{ kind: 'create', detected: fresh }]);
    });

    it('atualiza a série que já existe, em qualquer situação revisada, e ignora a descartada', () => {
        const confirmed: StoredSeries = stored({ id: 'c', status: 'confirmed' });
        const dismissed: StoredSeries = stored({ id: 'd', status: 'dismissed', merchantKey: 'SPOTIFY', typicalAmountMinor: 2190 });
        const spotify: DetectedSeries = detected({ merchantKey: 'SPOTIFY', typicalAmountMinor: 2190, chargeIds: ['x1'] });

        const actions = planSync([detected(), spotify], [confirmed, dismissed], [], TODAY);

        expect(actions).toEqual([{ kind: 'refresh', id: 'c', detected: detected(), reactivate: false }]);
    });

    it('apaga a sugestão que o detector não acha mais e para a confirmada que passou do prazo', () => {
        const suggestion: StoredSeries = stored({ id: 'sug' });
        const overdue: StoredSeries = stored({
            id: 'old',
            status: 'confirmed',
            merchantKey: 'SEGURO',
            lastDate: '2026-08-01',
            chargeIds: new Set<string>()
        });
        const onTime: StoredSeries = stored({
            id: 'ok',
            status: 'confirmed',
            merchantKey: 'LUZ',
            lastDate: '2026-11-10',
            chargeIds: new Set<string>()
        });
        const manualSuggestion: StoredSeries = stored({
            id: 'user-stopped',
            status: 'stopped',
            merchantKey: 'GYM',
            chargeIds: new Set<string>()
        });

        const actions = planSync([], [suggestion, overdue, onTime, manualSuggestion], [], TODAY);

        expect(actions).toEqual([
            { kind: 'remove', id: 'sug' },
            { kind: 'stop', id: 'old' }
        ]);
    });

    it('para a confirmada cuja última cobrança passou do prazo mesmo quando o detector a achou', () => {
        const confirmed: StoredSeries = stored({ id: 'c', status: 'confirmed' });
        const late: DetectedSeries = detected({ lastDate: '2026-08-05' });

        const actions = planSync([late], [confirmed], [], TODAY);

        expect(actions.map((action) => action.kind)).toEqual(['refresh', 'stop']);
    });

    it('reativa a parada pela Vera quando chega cobrança nova, mas não a parada pela pessoa', () => {
        const auto: StoredSeries = stored({ id: 'auto', status: 'stopped', stoppedBy: 'auto', lastDate: '2026-08-05' });
        const user: StoredSeries = stored({
            id: 'user',
            status: 'stopped',
            stoppedBy: 'user',
            lastDate: '2026-08-05',
            merchantKey: 'SPOTIFY'
        });
        const netflix: DetectedSeries = detected({ lastDate: '2026-11-05' });
        const spotify: DetectedSeries = detected({ merchantKey: 'SPOTIFY', chargeIds: ['x1', 'x2'], lastDate: '2026-11-05' });

        const actions = planSync([netflix, spotify], [auto, user], [], TODAY);

        expect(actions).toEqual([
            { kind: 'refresh', id: 'auto', detected: netflix, reactivate: true },
            { kind: 'refresh', id: 'user', detected: spotify, reactivate: false }
        ]);
    });
});

describe('diffCharges', () => {
    const rows: StoredCharge[] = [
        { id: 'r1', seriesId: 's1', transactionId: 't1', role: 'charge' },
        { id: 'r2', seriesId: 's1', transactionId: 't2', role: 'charge' },
        { id: 'r3', seriesId: 's1', transactionId: 't9', role: 'excluded' }
    ];

    it('insere o que falta, remove o que saiu e troca de papel por remoção mais inserção', () => {
        const diff = diffCharges(rows, [
            { transactionId: 't1', role: 'charge' },
            { transactionId: 't2', role: 'duplicate' },
            { transactionId: 't3', role: 'charge' }
        ]);

        expect(diff.removeIds).toEqual(['r2']);
        expect(diff.insert).toEqual([
            { transactionId: 't2', role: 'duplicate' },
            { transactionId: 't3', role: 'charge' }
        ]);
    });

    it('nunca toca na exclusão da pessoa e nunca a reinsere', () => {
        const diff = diffCharges(rows, [{ transactionId: 't9', role: 'charge' }]);

        expect(diff.removeIds).toEqual(['r1', 'r2']);
        expect(diff.insert).toEqual([]);
    });
});

describe('conversões do detector', () => {
    it('lista as cobranças com o papel de cada uma', () => {
        expect(desiredChargesOf(detected())).toEqual([
            { transactionId: 't1', role: 'charge' },
            { transactionId: 't2', role: 'charge' },
            { transactionId: 't3', role: 'charge' },
            { transactionId: 'd1', role: 'duplicate' },
            { transactionId: 'r1', role: 'trial' }
        ]);
    });

    it('o tipo da série vem da categoria e da assinatura conhecida', () => {
        expect(detectedFieldsOf(detected()).kind).toBe('subscription');
        expect(detectedFieldsOf(detected({ knownSubscription: false, categoryKey: 'housing' })).kind).toBe('bill');
        expect(detectedFieldsOf(detected({ knownSubscription: false, categoryKey: null })).kind).toBe('other');
    });
});
