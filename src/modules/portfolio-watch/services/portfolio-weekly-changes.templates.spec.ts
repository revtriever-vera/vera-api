import { describe, expect, it } from 'vitest';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import { WEEKLY_CHANGES_TEMPLATE } from '../domain/weekly-changes';
import { PortfolioWeeklyChangesTemplates } from './portfolio-weekly-changes.templates';

const ITEMS: string = JSON.stringify([
    {
        symbol: 'XPLG11',
        title: 'Fato <b>',
        summary: 'Distribuição <maior> que o previsto.',
        documentUrl: 'https://fnet.example/doc?id=1&x=2'
    }
]);

function props(): Record<string, string> {
    return {
        firstName: 'Ana',
        items: ITEMS,
        portfolioUrl: 'https://app.example.com/portfolio',
        unsubscribeUrl: 'https://api.example.com/u/x'
    };
}

function render(locale: 'pt-BR' | 'en'): MailContent {
    const registry: TemplateRegistry = new TemplateRegistry();
    new PortfolioWeeklyChangesTemplates(registry).onModuleInit();
    return registry.render(WEEKLY_CHANGES_TEMPLATE, locale, props());
}

describe('PortfolioWeeklyChangesTemplates', () => {
    it('em português tem o título, o resumo escapado com o link, o aviso no fim e o link da Carteira', () => {
        const mail: MailContent = render('pt-BR');

        expect(mail.subject).toBe('O que saiu sobre a sua carteira nesta semana');
        expect(mail.html).toContain('Distribuição &lt;maior&gt; que o previsto.');
        expect(mail.html).toContain('https://fnet.example/doc?id=1&amp;x=2');
        expect(mail.html).toContain('https://app.example.com/portfolio');
        expect(mail.html).toContain('Isto não é uma recomendação de compra ou venda.');
        expect(mail.text).toContain('- XPLG11: Distribuição <maior> que o previsto. https://fnet.example/doc?id=1&x=2');
        expect(mail.text).toContain('Ver a Carteira: https://app.example.com/portfolio');
        expect(mail.text.indexOf('Isto não é uma recomendação')).toBeGreaterThan(mail.text.indexOf('XPLG11'));
    });

    it('em inglês traduz o texto fixo', () => {
        const mail: MailContent = render('en');

        expect(mail.subject).toBe('What came out about your portfolio this week');
        expect(mail.html).toContain('This is not a recommendation to buy or sell.');
    });
});
