import { describe, expect, it } from 'vitest';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import { goalBehindProps } from '../domain/goal-behind-props';
import { GOAL_BEHIND_TEMPLATE } from '../domain/goal-notice.types';
import { GoalBehindTemplates } from './goal-behind.templates';

const GOAL = {
    id: 'g1',
    name: 'Reserva <b>',
    targetMinor: 3_120_000,
    targetDate: '2027-06-15',
    remainingMinor: 888_000,
    monthlyMinor: 148_000,
    planMonthlyMinor: 120_000,
    overdue: false
};

function registry(): TemplateRegistry {
    const templates: TemplateRegistry = new TemplateRegistry();
    new GoalBehindTemplates(templates).onModuleInit();
    return templates;
}

function propsOf(goals: (typeof GOAL)[]): Record<string, string> {
    return { ...goalBehindProps(goals, 'https://app.example.com'), firstName: 'Ana', unsubscribeUrl: 'https://api.example.com/u/abc' };
}

describe('template goal-behind', () => {
    it('em pt-BR diz quanto guardar por mês e quanto era, e leva o descadastro', () => {
        const mail: MailContent = registry().render(GOAL_BEHIND_TEMPLATE, 'pt-BR', propsOf([GOAL]));

        expect(mail.subject).toBe('Objetivo atrasado: Reserva <b>. Faltam R$ 8.880');
        expect(mail.text).toContain('Olá, Ana.');
        expect(mail.text).toContain('para chegar a R$ 31.200 em junho de 2027, são R$ 1.480 por mês. Eram R$ 1.200.');
        expect(mail.text).toContain('https://app.example.com/portfolio/goals');
        expect(mail.html).toContain('href="https://api.example.com/u/abc"');
        expect(mail.text).toContain('Este e-mail foi enviado automaticamente.');
        expect(mail.text).toContain('Não quero mais receber estes avisos: https://api.example.com/u/abc');
        expect(mail.html).toContain('Reserva &lt;b&gt;');
        expect(mail.html).not.toContain('Reserva <b>');
    });

    it('em inglês usa o mesmo conteúdo traduzido', () => {
        const mail: MailContent = registry().render(GOAL_BEHIND_TEMPLATE, 'en', propsOf([GOAL]));

        expect(mail.subject).toBe('Goal behind: Reserva <b>. R$8,880 to go');
        expect(mail.text).toContain('it takes R$1,480 a month. It was R$1,200.');
    });

    it('com dois objetivos sai um e-mail só, e o vencido diz que a data passou', () => {
        const mail: MailContent = registry().render(
            GOAL_BEHIND_TEMPLATE,
            'pt-BR',
            propsOf([GOAL, { ...GOAL, name: 'Viagem', overdue: true, targetDate: '2026-10-10' }])
        );

        expect(mail.subject).toBe('2 objetivos atrasados');
        expect(mail.text).toContain('Viagem: a data (outubro de 2026) passou e faltam R$ 8.880');
    });

    it('nunca leva nome de ativo nem o id do objetivo', () => {
        const mail: MailContent = registry().render(GOAL_BEHIND_TEMPLATE, 'pt-BR', propsOf([GOAL]));

        expect(mail.text).not.toContain('g1');
    });
});
