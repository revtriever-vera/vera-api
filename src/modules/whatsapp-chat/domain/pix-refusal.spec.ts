import { describe, expect, it } from 'vitest';
import { isPaymentRequest } from './pix-refusal';

describe('isPaymentRequest', () => {
    it.each([
        'faz um Pix de R$ 50 pra Maria',
        'PIX para o João',
        'quero transferir 100 reais',
        'faz uma transferência',
        'pague esse boleto',
        'preciso pagar a luz',
        'pague a conta',
        'pay my rent',
        'transfer 50 to Ana',
        'qual o pagamento do aluguel?'
    ])('"%s" vai para a recusa', (text: string) => {
        expect(isPaymentRequest(text)).toBe(true);
    });

    it('o falso positivo "pagamento do aluguel subiu?" vai para a recusa: é aceito de propósito, melhor recusar a mais', () => {
        expect(isPaymentRequest('pagamento do aluguel subiu?')).toBe(true);
    });

    it.each([
        'quanto gastei com delivery?',
        'como está minha carteira?',
        'pixel art',
        'apagar lembrete 2',
        'marca reunião sexta às 15h',
        'Me lembra de pagar o condomínio todo dia 12',
        'me lembra de pagar a fatura do cartão',
        'remind me to pay rent'
    ])('"%s" segue para o modelo', (text: string) => {
        expect(isPaymentRequest(text)).toBe(false);
    });
});
