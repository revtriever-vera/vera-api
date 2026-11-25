import { describe, expect, it } from 'vitest';
import { createdText, lastDayOfMonth, proposalSummary } from './goal-assistant-texts';

describe('textos do objetivo proposto pelo assistente', () => {
    it('o último dia do mês respeita fevereiro e ano bissexto', () => {
        expect(lastDayOfMonth('2027-12')).toBe('2027-12-31');
        expect(lastDayOfMonth('2027-02')).toBe('2027-02-28');
        expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    });

    it('a confirmação usa o tom de voz do card', () => {
        expect(createdText('viagem', 1_200_000, '2027-12-31', 'pt-BR')).toBe('Objetivo criado: viagem, R$ 12.000 até dezembro de 2027.');
        expect(createdText('trip', 1_200_000, '2027-12-31', 'en')).toBe('Goal created: trip, R$12,000 by December 2027.');
    });

    it('o resumo da proposta fala no futuro, sem dizer que criou, e mostra os centavos quando há', () => {
        const summary: string = proposalSummary('viagem', 1_234_567, '2027-12-31', 'pt-BR');

        expect(summary).toBe('Criar o objetivo viagem: R$ 12.345,67 até dezembro de 2027.');
        expect(summary).not.toMatch(/criei|criado/i);
    });
});
