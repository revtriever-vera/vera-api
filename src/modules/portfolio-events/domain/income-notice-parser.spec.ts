import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIncomeNotice } from './income-notice-parser';

function notice(name: string): string {
    return readFileSync(join(__dirname, '..', 'drivers', 'fixtures', 'cvm-ipe', `${name}.txt`), 'utf8');
}

describe('parseIncomeNotice', () => {
    it('reads a dividend notice whose payment date comes before the verb (Neoenergia)', () => {
        expect(parseIncomeNotice(notice('aviso-neoenergia-dividendos'))).toEqual({
            kind: 'dividend',
            exDate: '2025-12-30',
            paymentDate: '2026-02-09',
            amountPerUnit: '0.8106790501'
        });
    });

    it('reads a dividend notice with the data-com in the per-share item (Irani)', () => {
        expect(parseIncomeNotice(notice('aviso-irani-dividendos'))).toEqual({
            kind: 'dividend',
            exDate: '2026-08-07',
            paymentDate: '2026-08-20',
            amountPerUnit: '0.034404313'
        });
    });

    it('reads a JCP notice by the holders of record date (Unifique)', () => {
        expect(parseIncomeNotice(notice('aviso-unifique-jcp'))).toEqual({
            kind: 'jcp',
            exDate: '2026-07-24',
            paymentDate: '2026-08-05',
            amountPerUnit: '0.077032959'
        });
    });

    it('reads a rectification by the restated wording, not by the value it replaces (Sabesp)', () => {
        expect(parseIncomeNotice(notice('aviso-sabesp-retificacao-jcp'))).toEqual({
            kind: 'jcp',
            exDate: '2025-12-23',
            paymentDate: '2026-04-30',
            amountPerUnit: '2.643892990'
        });
    });

    it('returns nothing for a notice without data-com (profit allocation proposal, CEB)', () => {
        expect(parseIncomeNotice(notice('aviso-ceb-destinacao-sem-data-com'))).toBeNull();
    });

    it('returns nothing when the amount differs per share class, because the link does not carry the class', () => {
        const text: string =
            'AVISO AOS ACIONISTAS dividendos: R$0,50 por ação ordinária e R$0,55 por ação preferencial, ' +
            'com base na posição acionária de 10 de abril de 2026. Pagamento em 30 de abril de 2026.';

        expect(parseIncomeNotice(text)).toBeNull();
    });

    it('keeps the event without payment date when the payment is still to be defined', () => {
        const text: string =
            'AVISO AOS ACIONISTAS Juros sobre capital próprio de R$ 0,10 por ação, aos acionistas detentores de ações ' +
            'em 15/05/2026. A data de pagamento será oportunamente definida pela Companhia.';

        expect(parseIncomeNotice(text)).toEqual({ kind: 'jcp', exDate: '2026-05-15', paymentDate: null, amountPerUnit: '0.10' });
    });

    it('ignores the English copy that follows the Portuguese notice', () => {
        const text: string =
            'AVISO AOS ACIONISTAS dividendos de R$ 0,20 por ação, posição acionária de 02/06/2026. ' +
            'NOTICE TO SHAREHOLDERS dividends of R$ 0,90 per share, position of 06/02/2026.';

        expect(parseIncomeNotice(text)?.amountPerUnit).toBe('0.20');
    });

    it('does not take a net JCP amount as the declared value', () => {
        const text: string =
            'AVISO AOS ACIONISTAS JCP bruto de R$ 0,50 por ação, líquido de R$ 0,425 por ação, aos acionistas ' +
            'detentores de ações em 20/03/2026.';

        expect(parseIncomeNotice(text)?.amountPerUnit).toBe('0.50');
    });

    it('rejects impossible dates', () => {
        const text: string = 'AVISO AOS ACIONISTAS dividendos de R$ 0,20 por ação, posição acionária de 31/02/2026.';

        expect(parseIncomeNotice(text)).toBeNull();
    });
});
