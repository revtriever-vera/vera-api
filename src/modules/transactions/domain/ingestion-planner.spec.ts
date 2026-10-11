import { describe, expect, it } from 'vitest';
import { makeTransaction } from '../../../../test/support/spending-factories';
import { CandidatePool } from './cross-source-matcher';
import { decide, hasChanged, isFileSource, needsRecategorization, plan, PlanContext, RowCandidate, toCandidate } from './ingestion-planner';
import { PreparedTransaction, Transaction, TransactionSource } from './transactions.types';

function prepared(overrides: Partial<PreparedTransaction> = {}): PreparedTransaction {
    return {
        externalId: 'pluggy:1',
        date: '2026-09-10',
        amountMinor: -5000,
        description: 'COMPRA',
        normalizedDescription: 'COMPRA',
        counterpartyName: null,
        counterpartyKey: null,
        providerCategoryId: null,
        installmentNumber: null,
        installmentTotal: null,
        ...overrides
    };
}

function context(source: TransactionSource, overrides: Partial<PlanContext> = {}, candidates: Transaction[] = []): PlanContext {
    let next: number = 0;
    return {
        source,
        existing: new Map<string, Transaction>(),
        absorbedIds: new Set<string>(),
        pool: new CandidatePool<RowCandidate>(candidates.map(toCandidate)),
        newId: (): string => {
            next += 1;
            return `new-${String(next)}`;
        },
        ...overrides
    };
}

describe('hasChanged e needsRecategorization', () => {
    const row: Transaction = makeTransaction({ externalId: 'pluggy:1' });

    it('linha idêntica não mudou', () => {
        expect(hasChanged(row, prepared())).toBe(false);
    });

    it.each([
        ['data', { date: '2026-09-11' }],
        ['valor', { amountMinor: -5001 }],
        ['descrição', { description: 'OUTRA' }],
        ['categoria do provedor', { providerCategoryId: '10000000' }],
        ['favorecido', { counterpartyName: 'Maria' }],
        ['chave do favorecido', { counterpartyKey: 'k'.repeat(64) }]
    ])('mudança de %s conta como mudança', (_label: string, overrides: Partial<PreparedTransaction>) => {
        expect(hasChanged(row, prepared(overrides))).toBe(true);
    });

    it('só descrição ou categoria do provedor pedem nova categorização, e nunca em linha do usuário', () => {
        expect(needsRecategorization(row, prepared({ description: 'OUTRA' }))).toBe(true);
        expect(needsRecategorization(row, prepared({ providerCategoryId: '10000000' }))).toBe(true);
        expect(needsRecategorization(row, prepared({ amountMinor: -9999 }))).toBe(false);
        expect(needsRecategorization(makeTransaction({ categorySource: 'user' }), prepared({ description: 'OUTRA' }))).toBe(false);
    });
});

describe('decide', () => {
    it('linha existente sem mudança é unchanged e com mudança é update', () => {
        const row: Transaction = makeTransaction({ externalId: 'pluggy:1' });
        const existing: Map<string, Transaction> = new Map<string, Transaction>([['pluggy:1', row]]);

        expect(decide(prepared(), context('pluggy', { existing }))).toEqual({ kind: 'unchanged' });
        expect(decide(prepared({ description: 'NOVA' }), context('pluggy', { existing }))).toEqual({
            kind: 'update',
            row,
            recategorize: true
        });
        expect(decide(prepared({ amountMinor: -1 }), context('pluggy', { existing }))).toEqual({
            kind: 'update',
            row,
            recategorize: false
        });
    });

    it('arquivo já absorvido é duplicata e só vale para fontes de arquivo', () => {
        const absorbedIds: Set<string> = new Set<string>(['ofx:9']);

        expect(decide(prepared({ externalId: 'ofx:9' }), context('ofx', { absorbedIds }))).toEqual({ kind: 'duplicate' });
        expect(decide(prepared({ externalId: 'ofx:9' }), context('pluggy', { absorbedIds })).kind).toBe('insert');
    });

    it('arquivo chegando casa com a linha da Pluggy e a absorve', () => {
        const target: Transaction = makeTransaction({ id: 'p1', amountMinor: '-5000', date: new Date(2026, 8, 11) });

        const decision = decide(prepared({ externalId: 'ofx:1' }), context('ofx', {}, [target]));

        expect(decision).toEqual({ kind: 'absorb', target });
    });

    it('Pluggy chegando casa com a linha de arquivo e a substitui', () => {
        const file: Transaction = makeTransaction({ id: 'f1', source: 'ofx', amountMinor: '-5000' });

        const decision = decide(prepared(), context('pluggy', {}, [file]));

        expect(decision).toEqual({ kind: 'supersede', id: 'new-1', file });
    });

    it('sem par insere com id novo', () => {
        expect(decide(prepared(), context('pluggy'))).toEqual({ kind: 'insert', id: 'new-1' });
        expect(decide(prepared(), context('sample'))).toEqual({ kind: 'insert', id: 'new-1' });
    });
});

describe('plan', () => {
    it('casa um a um na ordem do lote', () => {
        const only: Transaction = makeTransaction({ id: 'p1', amountMinor: '-5000' });
        const items: PreparedTransaction[] = [prepared({ externalId: 'ofx:a' }), prepared({ externalId: 'ofx:b' })];

        const planned = plan(items, context('ofx', {}, [only]));

        expect(planned.map((entry) => entry.decision.kind)).toEqual(['absorb', 'insert']);
    });

    it('reconhece fontes de arquivo', () => {
        expect(isFileSource('ofx')).toBe(true);
        expect(isFileSource('csv')).toBe(true);
        expect(isFileSource('pluggy')).toBe(false);
        expect(isFileSource('sample')).toBe(false);
    });
});
