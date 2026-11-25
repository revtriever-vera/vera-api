import { describe, expect, it } from 'vitest';
import { EditedLine, StoredLine } from './investment-import.types';
import { LineFacts, verdictOf } from './line-evaluation';

const LINE: StoredLine = {
    lineId: 'L1',
    lineNumber: 1,
    kind: 'buy',
    incomeKind: null,
    direction: 'credit',
    tradeDate: '2026-01-10',
    ticker: 'ITUB4',
    quantity: '10',
    unitPrice: '5.5',
    grossMinor: 5500,
    currency: 'BRL',
    sourceRef: 'b3:x:1',
    check: null
};

function edited(extra: Partial<EditedLine> = {}, line: Partial<StoredLine> = {}): EditedLine {
    return { line: { ...LINE, ...line }, assetId: null, feesMinor: 0, skip: false, repriced: false, positionMode: null, ...extra };
}

function facts(item: EditedLine, extra: Partial<LineFacts> = {}): LineFacts {
    return { edited: item, assetId: 'a1', duplicate: false, failure: null, hasPosition: false, ...extra };
}

describe('verdictOf', () => {
    it('is ok for an asset without position', () => {
        expect(verdictOf(facts(edited()))).toEqual({ status: 'ok', reason: null });
    });

    it('asks for a choice when the asset already has a position', () => {
        expect(verdictOf(facts(edited(), { hasPosition: true }))).toEqual({ status: 'check', reason: 'position_mode_required' });
        expect(verdictOf(facts(edited({ positionMode: 'add' }), { hasPosition: true })).status).toBe('ok');
        expect(verdictOf(facts(edited({}, { kind: 'income', incomeKind: 'dividend' }), { hasPosition: true })).status).toBe('ok');
    });

    it('a linha lida pelo modelo com conta que não bate vem como check com o motivo', () => {
        const flagged: EditedLine = edited({}, { check: 'amount_mismatch' });

        expect(verdictOf(facts(flagged))).toEqual({ status: 'check', reason: 'amount_mismatch' });
        expect(verdictOf(facts(flagged, { hasPosition: true })).reason).toBe('position_mode_required');
        expect(verdictOf(facts(flagged, { failure: 'sell_exceeds_position' })).status).toBe('blocked');
    });

    it('orders skip, missing asset, unsupported direction, duplicate and failure', () => {
        expect(verdictOf(facts(edited({ skip: true }), { assetId: null })).reason).toBe('skipped');
        expect(verdictOf(facts(edited(), { assetId: null })).reason).toBe('asset_not_found');
        expect(verdictOf(facts(edited({}, { kind: 'bonus', direction: 'debit' }))).reason).toBe('unsupported_direction');
        expect(verdictOf(facts(edited(), { duplicate: true, failure: 'sell_exceeds_position' })).status).toBe('duplicate');
        expect(verdictOf(facts(edited(), { failure: 'sell_exceeds_position' }))).toEqual({
            status: 'blocked',
            reason: 'sell_exceeds_position'
        });
    });
});
