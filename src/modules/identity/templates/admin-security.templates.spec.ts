import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import { ADMIN_RECOVERY_CODE_USED_TEMPLATE, ADMIN_TOTP_ACTIVATED_TEMPLATE, AdminSecurityTemplates } from './admin-security.templates';

function registry(): TemplateRegistry {
    const templates: TemplateRegistry = new TemplateRegistry();
    new AdminSecurityTemplates(templates).onModuleInit();
    return templates;
}

describe('AdminSecurityTemplates', () => {
    it('o aviso de ativação existe nos dois idiomas e manda avisar a plataforma se não foi a pessoa', () => {
        const ptBr = registry().render(ADMIN_TOTP_ACTIVATED_TEMPLATE, 'pt-BR', {});
        const en = registry().render(ADMIN_TOTP_ACTIVATED_TEMPLATE, 'en', {});

        expect(ptBr.subject).toBe('Autenticador ativado no admin da Vera');
        expect(ptBr.text).toContain('Se não foi você');
        expect(en.subject).toBe('Authenticator turned on for the Vera admin');
        expect(en.html).toContain('If this was not you');
    });

    it('o aviso de código de recuperação existe nos dois idiomas e não carrega código nenhum', () => {
        const ptBr = registry().render(ADMIN_RECOVERY_CODE_USED_TEMPLATE, 'pt-BR', { code: 'abcde-fghjk' });
        const en = registry().render(ADMIN_RECOVERY_CODE_USED_TEMPLATE, 'en', { code: 'abcde-fghjk' });

        expect(ptBr.subject).toBe('Código de recuperação usado no admin da Vera');
        expect(en.subject).toBe('Recovery code used on the Vera admin');
        expect(ptBr.text + ptBr.html + en.text + en.html).not.toContain('abcde-fghjk');
    });
});
