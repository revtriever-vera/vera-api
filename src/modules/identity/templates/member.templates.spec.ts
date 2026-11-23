import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import {
    ACCOUNT_DELETED_MEMBER_TEMPLATE,
    MEMBER_INVITED_TEMPLATE,
    MEMBER_LEFT_TEMPLATE,
    MEMBER_REMOVED_TEMPLATE,
    MemberTemplates
} from './member.templates';

function registry(): TemplateRegistry {
    const templates: TemplateRegistry = new TemplateRegistry();
    new MemberTemplates(templates).onModuleInit();
    return templates;
}

describe('MemberTemplates', () => {
    it('o convite diz quem convidou, o papel, o link e a validade, nos dois idiomas', () => {
        const props = { inviterName: 'Marcos', role: 'editor', link: 'https://app.example.test/convite/abc', days: '7' };

        const ptBr = registry().render(MEMBER_INVITED_TEMPLATE, 'pt-BR', props);
        const en = registry().render(MEMBER_INVITED_TEMPLATE, 'en', props);

        expect(ptBr.subject).toBe('Marcos te convidou para a conta dele na Vera');
        expect(ptBr.text).toContain('papel Editor');
        expect(ptBr.text).toContain('https://app.example.test/convite/abc');
        expect(ptBr.text).toContain('7 dias');
        expect(en.subject).toBe('Marcos invited you to their account on Vera');
        expect(en.text).toContain('Editor role');
        expect(ptBr.text).toContain('conta do Google neste e-mail');
        expect(ptBr.text).not.toContain('Facebook');
        expect(en.text).toContain('Google account for this e-mail');
        expect(en.text).not.toContain('Facebook');
    });

    it('escapa o nome no HTML', () => {
        const mail = registry().render(MEMBER_REMOVED_TEMPLATE, 'pt-BR', { firstName: '<b>Ana</b>', accountName: 'Marcos' });

        expect(mail.html).not.toContain('<b>Ana</b>');
        expect(mail.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
        expect(mail.subject).toBe('Você não tem mais acesso à conta de Marcos na Vera');
    });

    it('os avisos de saída e de exclusão existem nos dois idiomas', () => {
        const props = { firstName: 'Ana', accountName: 'Marcos' };

        for (const name of [MEMBER_LEFT_TEMPLATE, MEMBER_REMOVED_TEMPLATE, ACCOUNT_DELETED_MEMBER_TEMPLATE]) {
            expect(registry().render(name, 'pt-BR', props).subject).toContain('Marcos');
            expect(registry().render(name, 'en', props).subject).toContain('Marcos');
        }
    });
});
