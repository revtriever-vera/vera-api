import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import { USAGE_PAUSED_TEMPLATE, USAGE_WARNING_TEMPLATE, UsageTemplates } from './usage.templates';

const PROPS = { firstName: 'Ana <b>', percent: '85', month: 'outubro', resetMonth: 'novembro' };

function registry(): TemplateRegistry {
    const instance: TemplateRegistry = new TemplateRegistry();
    new UsageTemplates(instance).onModuleInit();
    return instance;
}

describe('UsageTemplates', () => {
    it('o aviso fala da cota usada e da pausa em 100%, sem cobrança extra', () => {
        const content = registry().render(USAGE_WARNING_TEMPLATE, 'pt-BR', PROPS);

        expect(content.subject).toContain('85%');
        expect(content.text).toContain(
            '85% da cota de outubro usada. Em 100%, explicações e WhatsApp pausam até 1º de novembro, sem cobrança extra.'
        );
        expect(content.html).toContain('Ana &lt;b&gt;');
        expect(content.html).not.toContain('Ana <b>');
    });

    it('a pausa avisa até quando e existe em inglês', () => {
        const pt = registry().render(USAGE_PAUSED_TEMPLATE, 'pt-BR', PROPS);
        const en = registry().render(USAGE_PAUSED_TEMPLATE, 'en', { ...PROPS, month: 'October', resetMonth: 'November' });
        const warningEn = registry().render(USAGE_WARNING_TEMPLATE, 'en', { ...PROPS, month: 'October', resetMonth: 'November' });

        expect(pt.text).toContain('pausados até 1º de novembro');
        expect(en.text).toContain('paused until November 1');
        expect(warningEn.text).toContain('85% of your October quota is used');
    });

    it('cumprimenta sem nome', () => {
        expect(registry().render(USAGE_WARNING_TEMPLATE, 'pt-BR', { percent: '80' }).text.startsWith('Olá.')).toBe(true);
        expect(registry().render(USAGE_PAUSED_TEMPLATE, 'en', {}).text.startsWith('Hi.')).toBe(true);
    });
});
