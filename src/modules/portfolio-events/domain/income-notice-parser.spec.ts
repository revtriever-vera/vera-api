import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIncomeNotices } from './income-notice-parser';

function notice(name: string): string {
    return readFileSync(join(__dirname, '..', 'drivers', 'fixtures', 'cvm-ipe', `${name}.txt`), 'utf8');
}

describe('parseIncomeNotices', () => {
    it('reads a dividend notice whose payment date comes before the verb (Neoenergia)', () => {
        expect(parseIncomeNotices(notice('aviso-neoenergia-dividendos'))).toEqual([
            { kind: 'dividend', exDate: '2025-12-30', paymentDate: '2026-02-09', amountPerUnit: '0.8106790501', shareClass: 'ON' }
        ]);
    });

    it('reads a dividend notice with the data-com in the per-share item (Irani)', () => {
        expect(parseIncomeNotices(notice('aviso-irani-dividendos'))).toEqual([
            { kind: 'dividend', exDate: '2026-08-07', paymentDate: '2026-08-20', amountPerUnit: '0.034404313', shareClass: 'ON' }
        ]);
    });

    it('reads a JCP notice by the holders of record date (Unifique)', () => {
        expect(parseIncomeNotices(notice('aviso-unifique-jcp'))).toEqual([
            { kind: 'jcp', exDate: '2026-07-24', paymentDate: '2026-08-05', amountPerUnit: '0.077032959', shareClass: null }
        ]);
    });

    it('reads a rectification by the restated wording, not by the value it replaces (Sabesp)', () => {
        expect(parseIncomeNotices(notice('aviso-sabesp-retificacao-jcp'))).toEqual([
            { kind: 'jcp', exDate: '2025-12-23', paymentDate: '2026-04-30', amountPerUnit: '2.643892990', shareClass: null }
        ]);
    });

    it('returns nothing for a notice without data-com (profit allocation proposal, CEB)', () => {
        expect(parseIncomeNotices(notice('aviso-ceb-destinacao-sem-data-com'))).toEqual([]);
    });

    it('writes one notice per share class when the amounts differ (running text)', () => {
        const text: string =
            'AVISO AOS ACIONISTAS dividendos: R$0,50 por ação ordinária e R$0,55 por ação preferencial, ' +
            'com base na posição acionária de 10 de abril de 2026. Pagamento em 30 de abril de 2026.';

        expect(parseIncomeNotices(text).map((item) => [item.shareClass, item.amountPerUnit, item.exDate, item.paymentDate])).toEqual([
            ['ON', '0.50', '2026-04-10', '2026-04-30'],
            ['PN', '0.55', '2026-04-10', '2026-04-30']
        ]);
    });

    it.each([
        [
            'a table with the series of the preferred shares',
            'AVISO AOS ACIONISTAS JCP. Espécie Valor bruto por ação ON 0,1000 PNA 0,1100 PNB 0,1200 ' +
                'Fará jus aos JCP os detentores de ações em 15/05/2026. Pagamento em 30/05/2026.',
            [
                ['ON', '0.1000'],
                ['PNA', '0.1100'],
                ['PNB', '0.1200']
            ]
        ],
        [
            'one amount shared by the classes it names',
            'AVISO AOS ACIONISTAS dividendos de R$ 0,20 por ação ordinária e preferencial, posição acionária de 02/06/2026.',
            [
                ['ON', '0.20'],
                ['PN', '0.20']
            ]
        ],
        [
            'the Unit amount given by the notice',
            'AVISO AOS ACIONISTAS dividendos: R$ 0,10 por ação ON, R$ 0,20 por ação PN e R$ 0,50 por Unit, posição acionária de 10/04/2026.',
            [
                ['ON', '0.10'],
                ['PN', '0.20'],
                ['UNIT', '0.50']
            ]
        ]
    ])('writes one notice per share class from %s', (_name: string, text: string, expected: string[][]) => {
        expect(parseIncomeNotices(text).map((item) => [item.shareClass, item.amountPerUnit])).toEqual(expected);
    });

    it.each([
        [
            'a total in reais labeled with a class',
            'AVISO AOS ACIONISTAS dividendos de R$ 500.000.000,00 às ações ordinárias, posição acionária de 02/06/2026.'
        ],
        [
            'two different amounts for one class',
            'AVISO AOS ACIONISTAS dividendos: R$ 0,50 por ação ON e R$ 0,60 por ação ON, posição acionária de 10/04/2026.'
        ]
    ])('returns nothing for %s', (_name: string, text: string) => {
        expect(parseIncomeNotices(text)).toEqual([]);
    });

    it('composes the Unit from its components only when the notice states the composition', () => {
        const known: string =
            'AVISO AOS ACIONISTAS dividendos: R$ 0,10 por ação ordinária e R$ 0,20 por ação preferencial. ' +
            'Cada Unit é composta por 1 ação ordinária e 2 ações preferenciais. Posição acionária de 10/04/2026.';
        const unknown: string = known.replace(/Cada Unit é composta[^.]*\./, '');

        expect(parseIncomeNotices(known).map((item) => [item.shareClass, item.amountPerUnit])).toEqual([
            ['ON', '0.10'],
            ['PN', '0.20'],
            ['UNIT', '0.50']
        ]);
        expect(parseIncomeNotices(unknown).map((item) => item.shareClass)).toEqual(['ON', 'PN']);
    });

    it('keeps the event without payment date when the payment is still to be defined', () => {
        const text: string =
            'AVISO AOS ACIONISTAS Juros sobre capital próprio de R$ 0,10 por ação, aos acionistas detentores de ações ' +
            'em 15/05/2026. A data de pagamento será oportunamente definida pela Companhia.';

        expect(parseIncomeNotices(text)).toEqual([
            { kind: 'jcp', exDate: '2026-05-15', paymentDate: null, amountPerUnit: '0.10', shareClass: null }
        ]);
    });

    it('ignores the English copy that follows the Portuguese notice', () => {
        const text: string =
            'AVISO AOS ACIONISTAS dividendos de R$ 0,20 por ação, posição acionária de 02/06/2026. ' +
            'NOTICE TO SHAREHOLDERS dividends of R$ 0,90 per share, position of 06/02/2026.';

        expect(parseIncomeNotices(text).map((item) => item.amountPerUnit)).toEqual(['0.20']);
    });

    it('does not take a net JCP amount as the declared value', () => {
        const text: string =
            'AVISO AOS ACIONISTAS JCP bruto de R$ 0,50 por ação, líquido de R$ 0,425 por ação, aos acionistas ' +
            'detentores de ações em 20/03/2026.';

        expect(parseIncomeNotices(text).map((item) => item.amountPerUnit)).toEqual(['0.50']);
    });

    it('rejects impossible dates', () => {
        const text: string = 'AVISO AOS ACIONISTAS dividendos de R$ 0,20 por ação, posição acionária de 31/02/2026.';

        expect(parseIncomeNotices(text)).toEqual([]);
    });
});
