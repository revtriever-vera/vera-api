import { describe, expect, it } from 'vitest';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import { MONTHLY_REVIEW_TEMPLATE } from '../domain/monthly-review-notice';
import { PortfolioMonthlyReviewTemplates } from './portfolio-monthly-review.templates';

function props(extra: Record<string, string> = {}): Record<string, string> {
    return {
        firstName: 'Ana',
        month: '2026-10',
        currency: 'BRL',
        incomeMinor: '5000',
        returnPct: '1.5',
        cdiPct: '1',
        reviewUrl: 'https://app.example.com/portfolio/review',
        unsubscribeUrl: 'https://api.example.com/u/x',
        ...extra
    };
}

function render(locale: 'pt-BR' | 'en', values: Record<string, string>): MailContent {
    const registry: TemplateRegistry = new TemplateRegistry();
    new PortfolioMonthlyReviewTemplates(registry).onModuleInit();
    return registry.render(MONTHLY_REVIEW_TEMPLATE, locale, values);
}

describe('PortfolioMonthlyReviewTemplates', () => {
    it('em português traz o mês, os números, o parágrafo sem negrito escapado, o link da tela e o aviso no fim', () => {
        const mail: MailContent = render('pt-BR', props({ paragraphs: JSON.stringify(['Rendeu **+1,50%** <b>em outubro</b>.']) }));

        expect(mail.subject).toBe('O Raio-X de outubro de 2026 da sua carteira');
        expect(mail.html).toContain('Rentabilidade da carteira: <strong>+1,50%</strong>');
        expect(mail.html).toContain('CDI: <strong>+1,00%</strong>');
        expect(mail.html).toContain('Proventos do mês');
        expect(mail.html).toContain('Rendeu +1,50% &lt;b&gt;em outubro&lt;/b&gt;.');
        expect(mail.html).toContain('https://app.example.com/portfolio/review');
        expect(mail.html).toContain('Isto não é uma recomendação de compra ou venda.');
        expect(mail.text).toContain('- Rentabilidade da carteira: +1,50%');
        expect(mail.text).toContain('Rendeu +1,50% <b>em outubro</b>.');
        expect(mail.text).toContain('Ver o Raio-X: https://app.example.com/portfolio/review');
        expect(mail.text.indexOf('Isto não é uma recomendação')).toBeGreaterThan(mail.text.indexOf('Ver o Raio-X'));
    });

    it('sem parágrafo, sem provento e sem rentabilidade manda só o que existe e explica a falta da rentabilidade', () => {
        const mail: MailContent = render('pt-BR', {
            month: '2026-10',
            currency: 'BRL',
            incomeMinor: '0',
            reviewUrl: 'https://app.example.com/portfolio/review'
        });

        expect(mail.html).toContain('não pôde ser calculada');
        expect(mail.html).not.toContain('Proventos do mês');
        expect(mail.text).toContain('Olá.');
    });

    it('em inglês traduz o texto fixo e o mês', () => {
        const mail: MailContent = render('en', props());

        expect(mail.subject).toBe('The October 2026 X-ray of your portfolio');
        expect(mail.html).toContain('Portfolio return: <strong>+1.50%</strong>');
        expect(mail.html).toContain('This is not a recommendation to buy or sell.');
        expect(mail.text).toContain('Hi, Ana.');
    });
});
