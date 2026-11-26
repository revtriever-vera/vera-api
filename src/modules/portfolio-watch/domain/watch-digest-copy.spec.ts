import { describe, expect, it } from 'vitest';
import { WatchDigestEntry } from '../validation/portfolio-watch.schemas';
import { watchDigestCopy } from './watch-digest-copy';

function entry(overrides: Partial<WatchDigestEntry>): WatchDigestEntry {
    return {
        type: 'portfolio_ex_date_tomorrow',
        name: 'XPLG11',
        date: '2026-12-02',
        days: 1,
        paymentDate: '2026-12-14',
        amountPerUnit: '0.78',
        currency: 'BRL',
        documentUrl: '',
        ...overrides
    };
}

describe('texto do e-mail da agenda', () => {
    it('data-com em pt-BR: valor e data primeiro, sem exclamação', () => {
        const copy = watchDigestCopy([entry({})], 'pt-BR');

        expect(copy.subject).toBe('1 aviso da sua carteira hoje');
        expect(copy.lines[0]?.text).toBe('Amanhã é a data-com de XPLG11: R$ 0,78 por cota. Pagamento em 14/12.');
    });

    it('pagamento, assembleia e vencimento em pt-BR', () => {
        const copy = watchDigestCopy(
            [
                entry({ type: 'portfolio_payment_today' }),
                entry({ type: 'portfolio_assembly_soon', name: 'PETR4', days: 3, date: '2026-12-04', documentUrl: 'https://x.test/a' }),
                entry({ type: 'fixed_income_maturity_soon', name: 'CDB Banco X', days: 15, date: '2026-12-10', amountPerUnit: '' })
            ],
            'pt-BR'
        );

        expect(copy.subject).toBe('3 avisos da sua carteira hoje');
        expect(copy.lines.map((line) => line.text)).toEqual([
            'Hoje é o pagamento de XPLG11: R$ 0,78 por cota.',
            'Em 3 dias, em 04/12, tem assembleia de PETR4.',
            'CDB Banco X vence em 15 dias, em 10/12/2026.'
        ]);
        expect(copy.lines[1]?.documentUrl).toBe('https://x.test/a');
    });

    it('data-com sem valor nem pagamento anunciados', () => {
        const copy = watchDigestCopy([entry({ amountPerUnit: '', paymentDate: '' })], 'pt-BR');

        expect(copy.lines[0]?.text).toBe('Amanhã é a data-com de XPLG11.');
    });

    it('em inglês, com o dólar quando a moeda é USD', () => {
        const copy = watchDigestCopy(
            [
                entry({ currency: 'USD', amountPerUnit: '0.5' }),
                entry({ type: 'portfolio_payment_today', amountPerUnit: '' }),
                entry({ type: 'portfolio_assembly_soon', name: 'AAPL', days: 3, date: '2026-12-04' }),
                entry({ type: 'fixed_income_maturity_soon', name: 'CDB', days: 15, date: '2026-12-10' })
            ],
            'en'
        );

        expect(copy.subject).toBe('4 notices about your portfolio today');
        expect(copy.lines.map((line) => line.text)).toEqual([
            'Tomorrow is the ex-date of XPLG11: $0.50 per share. Payment on Dec 14.',
            'Today is the payment of XPLG11.',
            'In 3 days, on Dec 4, there is an assembly of AAPL.',
            'CDB matures in 15 days, on Dec 10, 2026.'
        ]);
    });

    it('só aceita link de documento https', () => {
        const copy = watchDigestCopy([entry({ documentUrl: 'javascript:alert(1)' })], 'en');

        expect(copy.lines[0]?.documentUrl).toBeNull();
    });
});
