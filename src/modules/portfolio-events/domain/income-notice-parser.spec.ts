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

    describe('real notices of the CVM (QA of Fase 1)', () => {
        it('reads the data-com written with curly quotes and ignores the installments after it (Cemig)', () => {
            expect(parseIncomeNotices(notice('aviso-cemig-jcp-com-direitos'))).toEqual([
                { kind: 'jcp', exDate: '2026-09-22', paymentDate: null, amountPerUnit: '0.06991340114', shareClass: null }
            ]);
        });

        it('reads a table that writes the titles first: dividend and JCP per share and per Unit (Taesa)', () => {
            const found = parseIncomeNotices(notice('aviso-taesa-proventos-tabela')).map((item) => [
                item.kind,
                item.shareClass,
                item.amountPerUnit,
                item.exDate,
                item.paymentDate
            ]);

            expect(found).toEqual([
                ['dividend', 'ON', '0.08025458488', '2026-08-14', '2026-11-26'],
                ['dividend', 'PN', '0.08025458488', '2026-08-14', '2026-11-26'],
                ['dividend', 'UNIT', '0.24076375464', '2026-08-14', '2026-11-26'],
                ['jcp', 'ON', '0.11982485996', '2026-08-14', '2026-11-26'],
                ['jcp', 'PN', '0.11982485996', '2026-08-14', '2026-11-26'],
                ['jcp', 'UNIT', '0.35947457988', '2026-08-14', '2026-11-26']
            ]);
        });

        it('takes the Unit column of a one-kind table and not the total in reais (Taesa)', () => {
            const found = parseIncomeNotices(notice('aviso-taesa-dividendos-tabela-unit')).filter((item) => item.shareClass === 'UNIT');

            expect(found).toEqual([
                { kind: 'dividend', exDate: '2026-11-16', paymentDate: '2027-01-27', amountPerUnit: '1.05610815696', shareClass: 'UNIT' }
            ]);
        });

        it('writes one event per declaration when the notice has a column for each (Itaú)', () => {
            expect(parseIncomeNotices(notice('aviso-itau-jcp-duas-declaracoes'))).toEqual([
                { kind: 'jcp', exDate: '2026-03-19', paymentDate: '2026-08-28', amountPerUnit: '0.34888', shareClass: null },
                { kind: 'jcp', exDate: '2026-06-18', paymentDate: '2026-08-28', amountPerUnit: '0.36188', shareClass: null }
            ]);
        });

        it('reads the data-com written in full after "titulares de ações escriturais em" (WEG)', () => {
            expect(parseIncomeNotices(notice('aviso-weg-jcp-titulares'))).toEqual([
                { kind: 'jcp', exDate: '2026-09-18', paymentDate: '2027-03-10', amountPerUnit: '0.107212121', shareClass: null }
            ]);
        });

        it('takes the record date from the registrar base when the payment is still to be defined (Engie)', () => {
            expect(parseIncomeNotices(notice('aviso-engie-dividendos-sem-pagamento'))).toEqual([
                { kind: 'dividend', exDate: '2026-08-20', paymentDate: null, amountPerUnit: '0.54420747574', shareClass: null }
            ]);
        });

        it.each([
            ['an installment of a dividend already declared, in total reais (CPFL)', 'aviso-cpfl-parcela-sem-valor-por-acao'],
            ['an update of a declared JCP without data-com (Banco do Brasil)', 'aviso-bb-jcp-complementar'],
            ['a tax guidance that points to another notice for the dates (Petrobras)', 'aviso-petrobras-orientacao-nao-residentes']
        ])('makes no event from %s', (_name: string, fixture: string) => {
            expect(parseIncomeNotices(notice(fixture))).toEqual([]);
        });
    });
});
