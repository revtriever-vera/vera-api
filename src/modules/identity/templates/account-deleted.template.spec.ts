import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import { AccountDeletedTemplate } from './account-deleted.template';

function build(): TemplateRegistry {
    const registry: TemplateRegistry = new TemplateRegistry();
    new AccountDeletedTemplate(registry).onModuleInit();
    return registry;
}

describe('AccountDeletedTemplate', () => {
    it('renderiza em pt-BR e em en com o primeiro nome', () => {
        const registry: TemplateRegistry = build();

        const pt = registry.render('account-deleted', 'pt-BR', { firstName: 'Ana' });
        const en = registry.render('account-deleted', 'en', { firstName: 'Ana' });

        expect(pt.subject).toBe('Sua conta na Vera foi excluída');
        expect(pt.text).toContain('Olá, Ana.');
        expect(en.subject).toBe('Your Vera account was deleted');
        expect(en.text).toContain('Hi, Ana.');
    });

    it('não leva link, e escapa o nome no HTML', () => {
        const registry: TemplateRegistry = build();

        const content = registry.render('account-deleted', 'en', { firstName: '<b>"Ana"</b>' });

        expect(content.html).toContain('&lt;b&gt;&quot;Ana&quot;&lt;/b&gt;');
        expect(content.html).not.toContain('<b>');
        expect(content.html).not.toContain('href=');
    });

    it('cumprimenta sem nome quando não há primeiro nome', () => {
        const registry: TemplateRegistry = build();

        expect(registry.render('account-deleted', 'pt-BR', { firstName: '' }).text).toMatch(/^Olá\./);
        expect(registry.render('account-deleted', 'en', {}).text).toMatch(/^Hi\./);
    });
});
