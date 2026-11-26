import { describe, expect, it } from 'vitest';
import { AgendaItem } from './portfolio-agenda.types';
import { addDaysTo, watchNoticeEntriesOf } from './watch-notice-entries';

const TODAY: string = '2026-12-01';
const ASSET: string = '0199b5b8-1c2d-7000-8000-0000000000a1';

function item(overrides: Partial<AgendaItem>): AgendaItem {
    return {
        id: 'e1',
        kind: 'fii_income',
        assetId: ASSET,
        holdingId: null,
        name: 'XPLG11',
        date: TODAY,
        exDate: null,
        paymentDate: null,
        eventDate: null,
        amountPerUnit: '0.78',
        currency: 'BRL',
        amountForAccountMinor: 7800,
        estimated: true,
        documentUrl: null,
        ...overrides
    };
}

describe('avisos da agenda da carteira', () => {
    it('soma dias a uma data sem fuso e passa de mês e de ano', () => {
        expect(addDaysTo('2026-12-30', 3)).toBe('2027-01-02');
    });

    it('avisa a data-com de amanhã com a chave do tipo, do ativo e da data', () => {
        const entries = watchNoticeEntriesOf([item({ exDate: '2026-12-02', paymentDate: '2026-12-14' })], TODAY);

        expect(entries).toEqual([
            {
                type: 'portfolio_ex_date_tomorrow',
                key: `portfolio_ex_date_tomorrow:${ASSET}:2026-12-02`,
                data: {
                    name: 'XPLG11',
                    date: '2026-12-02',
                    days: '1',
                    paymentDate: '2026-12-14',
                    amountPerUnit: '0.78',
                    currency: 'BRL',
                    documentUrl: ''
                }
            }
        ]);
    });

    it('avisa o pagamento de hoje e não o de outro dia', () => {
        const today = watchNoticeEntriesOf([item({ exDate: '2026-11-20', paymentDate: TODAY })], TODAY);
        const other = watchNoticeEntriesOf([item({ exDate: '2026-11-20', paymentDate: '2026-12-02' })], TODAY);

        expect(today.map((entry) => entry.type)).toEqual(['portfolio_payment_today']);
        expect(other).toEqual([]);
    });

    it('data-com amanhã e pagamento hoje de eventos diferentes viram dois avisos', () => {
        const entries = watchNoticeEntriesOf(
            [item({ id: 'a', exDate: '2026-12-02' }), item({ id: 'b', assetId: 'x', exDate: '2026-11-01', paymentDate: TODAY })],
            TODAY
        );

        expect(entries.map((entry) => entry.type)).toEqual(['portfolio_ex_date_tomorrow', 'portfolio_payment_today']);
    });

    it('avisa a assembleia a 3 dias e o vencimento a 15 dias, e só nesses dias', () => {
        const entries = watchNoticeEntriesOf(
            [
                item({ id: 'a', kind: 'assembly', eventDate: '2026-12-04', amountPerUnit: null, documentUrl: 'https://x.test/a' }),
                item({ id: 'b', kind: 'assembly', eventDate: '2026-12-05', amountPerUnit: null }),
                item({
                    id: 'c',
                    kind: 'fixed_income_maturity',
                    assetId: null,
                    holdingId: 'h1',
                    date: '2026-12-16',
                    eventDate: '2026-12-16',
                    amountPerUnit: null
                }),
                item({
                    id: 'd',
                    kind: 'treasury_maturity',
                    assetId: null,
                    holdingId: 'h2',
                    date: '2026-12-15',
                    eventDate: '2026-12-15',
                    amountPerUnit: null
                })
            ],
            TODAY
        );

        expect(entries.map((entry) => entry.key)).toEqual([
            `portfolio_assembly_soon:${ASSET}:2026-12-04`,
            'fixed_income_maturity_soon:h1:2026-12-16'
        ]);
        expect(entries[0]?.data['documentUrl']).toBe('https://x.test/a');
        expect(entries[1]?.data['days']).toBe('15');
    });

    it('dividendo e JCP do mesmo ativo na mesma data-com viram um aviso, com o valor somado', () => {
        const entries = watchNoticeEntriesOf(
            [
                item({ id: 'a', kind: 'dividend', exDate: '2026-12-02', amountPerUnit: '0.50' }),
                item({ id: 'b', kind: 'jcp', exDate: '2026-12-02', amountPerUnit: '0.28', documentUrl: 'https://x.test/j' })
            ],
            TODAY
        );

        expect(entries).toHaveLength(1);
        expect(entries[0]?.data).toMatchObject({ amountPerUnit: '0.78', documentUrl: 'https://x.test/j' });
    });

    it('ao juntar, fica o valor que existe quando só um tem, e o primeiro quando as moedas diferem', () => {
        const onlySecond = watchNoticeEntriesOf(
            [item({ id: 'a', exDate: '2026-12-02', amountPerUnit: null }), item({ id: 'b', exDate: '2026-12-02', amountPerUnit: '0.10' })],
            TODAY
        );
        const otherCurrency = watchNoticeEntriesOf(
            [item({ id: 'a', exDate: '2026-12-02' }), item({ id: 'b', exDate: '2026-12-02', amountPerUnit: '1', currency: 'USD' })],
            TODAY
        );

        expect(onlySecond[0]?.data['amountPerUnit']).toBe('0.10');
        expect(otherCurrency[0]?.data['amountPerUnit']).toBe('0.78');
    });

    it('evento que não é de renda não gera aviso de data-com', () => {
        expect(watchNoticeEntriesOf([item({ kind: 'earnings_release', exDate: '2026-12-02' })], TODAY)).toEqual([]);
    });
});
