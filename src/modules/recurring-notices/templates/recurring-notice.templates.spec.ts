import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../../../core/mail/template.registry';
import { duePropsOf, weekPropsOf, WeekAlert, WeekEntry } from '../domain/notice-props';
import { RecurringNoticeTemplates } from './recurring-notice.templates';

const ENTRIES: WeekEntry[] = [
    { date: '2026-11-25', name: 'Netflix', amountMinor: 5590, estimate: false, card: true, account: 'Nubank' },
    { date: '2026-11-27', name: 'Enel <b>', amountMinor: 18200, estimate: true, card: false, account: 'Itaú' }
];
const ALERTS: WeekAlert[] = [
    { kind: 'price_increase', name: 'Netflix', values: { fromAmountMinor: 4490, toAmountMinor: 5590, percent: 24 } },
    {
        kind: 'duplicate_charge',
        name: 'Spotify',
        values: { firstAmountMinor: 2190, firstDate: '2026-11-03', secondAmountMinor: 2190, secondDate: '2026-11-05' }
    },
    { kind: 'duplicate_account', name: 'Disney', values: {} }
];
const COMMON: Record<string, string> = {
    firstName: 'Ana',
    appUrl: 'https://app.example.com',
    unsubscribeUrl: 'https://api.example.com/u/token'
};

function registry(): TemplateRegistry {
    const templates: TemplateRegistry = new TemplateRegistry();
    new RecurringNoticeTemplates(templates).onModuleInit();
    return templates;
}

function plain(text: string): string {
    return text.replace(/\s/g, ' ');
}

describe('templates de recorrências', () => {
    it('o resumo da semana lista cada débito com data, estabelecimento, valor e conta, e o bloco "Para olhar"', () => {
        const mail = registry().render('recurring-week', 'pt-BR', { ...weekPropsOf(ENTRIES, ALERTS), ...COMMON });

        expect(plain(mail.subject)).toBe('Débitos desta semana: R$ 237,90 em 2 cobranças');
        expect(plain(mail.text)).toContain('qua 25/11 · Netflix · R$ 55,90 · cartão Nubank');
        expect(plain(mail.text)).toContain('sex 27/11 · Enel <b> · ≈ R$ 182,00 · conta Itaú');
        expect(plain(mail.text)).toContain('Netflix subiu de R$ 44,90 para R$ 55,90 (+24%)');
        expect(plain(mail.text)).toContain('Spotify cobrou 2 vezes: R$ 21,90 (03/11) e R$ 21,90 (05/11)');
        expect(mail.text).toContain('Parece a mesma assinatura em duas contas: Disney');
        expect(mail.text).toContain('Ver assinaturas e contas: https://app.example.com/spending/recurring');
        expect(mail.html).toContain('Enel &lt;b&gt;');
        expect(mail.html).not.toContain('Enel <b>');
        expect(mail.html).toContain('https://api.example.com/u/token');
    });

    it('o resumo em inglês usa o mês antes do dia e o singular', () => {
        const mail = registry().render('recurring-week', 'en', { ...weekPropsOf([ENTRIES[0] as WeekEntry], []), ...COMMON });

        expect(plain(mail.subject)).toBe('Debits this week: R$55.90 in 1 charge');
        expect(plain(mail.text)).toContain('Wed 11/25 · Netflix · R$55.90 · card Nubank');
        expect(mail.text).not.toContain('Worth a look');
    });

    it('a véspera leva o nome, o valor e a conta, e marca o valor estimado', () => {
        const fixed = registry().render('recurring-due', 'pt-BR', {
            ...duePropsOf({
                name: 'Seguro do carro',
                amountMinor: 38900,
                estimate: false,
                card: true,
                account: 'Itaú',
                lastDate: '2026-10-28'
            }),
            ...COMMON
        });
        const estimated = registry().render('recurring-due', 'en', {
            ...duePropsOf({ name: 'Enel', amountMinor: 18200, estimate: true, card: false, account: '', lastDate: '2026-10-28' }),
            ...COMMON
        });

        expect(plain(fixed.subject)).toBe('Amanhã: Seguro do carro, R$ 389,00');
        expect(plain(fixed.text)).toContain('No cartão Itaú. Valor da última cobrança, em 28/10.');
        expect(plain(estimated.subject)).toBe('Tomorrow: Enel, ≈ R$182.00');
        expect(estimated.text).toContain('Estimated amount, from the average of the last charges.');
        expect(estimated.text).not.toContain('On the');
    });
});
