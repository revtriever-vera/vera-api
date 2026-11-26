import { describe, expect, it } from 'vitest';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import { WATCH_DIGEST_TEMPLATE } from '../domain/portfolio-agenda.types';
import { PortfolioWatchDigestTemplates } from './portfolio-watch-digest.templates';

const ENTRIES: string = JSON.stringify([
    {
        type: 'portfolio_ex_date_tomorrow',
        name: 'XPLG11 <b>',
        date: '2026-12-02',
        days: '1',
        paymentDate: '2026-12-14',
        amountPerUnit: '0.78',
        currency: 'BRL',
        documentUrl: 'https://fnet.example/doc?id=1&x=2'
    },
    {
        type: 'fixed_income_maturity_soon',
        name: 'CDB Banco X',
        date: '2026-12-16',
        days: '15',
        paymentDate: '',
        amountPerUnit: '',
        currency: 'BRL',
        documentUrl: ''
    }
]);

function props(): Record<string, string> {
    return {
        firstName: 'Ana',
        entries: ENTRIES,
        unsubscribeUrls: JSON.stringify({
            portfolio_ex_date_tomorrow: 'https://api.example.com/u/ex',
            fixed_income_maturity_soon: 'https://api.example.com/u/mat'
        }),
        unsubscribeUrl: 'https://api.example.com/u/ex'
    };
}

function registry(): TemplateRegistry {
    const templates: TemplateRegistry = new TemplateRegistry();
    new PortfolioWatchDigestTemplates(templates).onModuleInit();
    return templates;
}

describe('template portfolio-watch-digest', () => {
    it('em pt-BR lista os eventos do dia, escapa o texto e leva um descadastro por tipo', () => {
        const mail: MailContent = registry().render(WATCH_DIGEST_TEMPLATE, 'pt-BR', props());

        expect(mail.subject).toBe('2 avisos da sua carteira hoje');
        expect(mail.text).toContain('Olá, Ana.');
        expect(mail.text).toContain(
            '- Amanhã é a data-com de XPLG11 <b>: R$ 0,78 por cota. Pagamento em 14/12. https://fnet.example/doc?id=1&x=2'
        );
        expect(mail.text).toContain('- CDB Banco X vence em 15 dias, em 16/12/2026.');
        expect(mail.text).toContain('Parar de receber: avisos de data-com: https://api.example.com/u/ex');
        expect(mail.text).toContain('Parar de receber: avisos de vencimento: https://api.example.com/u/mat');
        expect(mail.html).toContain('XPLG11 &lt;b&gt;');
        expect(mail.html).toContain('href="https://fnet.example/doc?id=1&amp;x=2"');
        expect(mail.html).toContain('href="https://api.example.com/u/mat"');
    });

    it('em inglês e sem nome, com o texto no idioma', () => {
        const mail: MailContent = registry().render(WATCH_DIGEST_TEMPLATE, 'en', { ...props(), firstName: '' });

        expect(mail.subject).toBe('2 notices about your portfolio today');
        expect(mail.text).toContain('Hi.');
        expect(mail.text).toContain('Stop receiving: ex-date notices: https://api.example.com/u/ex');
    });

    it('sem o link de um tipo, não inventa descadastro para ele', () => {
        const mail: MailContent = registry().render(WATCH_DIGEST_TEMPLATE, 'pt-BR', {
            ...props(),
            unsubscribeUrls: JSON.stringify({ portfolio_ex_date_tomorrow: 'https://api.example.com/u/ex' })
        });

        expect(mail.text).not.toContain('avisos de vencimento: ');
    });
});
