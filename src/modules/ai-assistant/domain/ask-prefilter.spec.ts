import { describe, expect, it } from 'vitest';
import { prefilterOf } from './ask-prefilter';

describe('prefilterOf', () => {
    it.each([
        'faz um Pix de R$ 50 pra Maria',
        'pague o boleto',
        'transfer 100 to John',
        'quero pagar a conta de luz',
        'manda um pix pro João',
        'pix de R$ 200 para a Ana',
        'make a Pix to Ana',
        'me passa o boleto da escola'
    ])('"%s" recebe a recusa fixa', (text: string) => {
        expect(prefilterOf(text)).toBe('refusal');
    });

    it.each(['oi', 'Oi!', 'olá', 'Bom dia.', 'hello', 'Good morning!'])('"%s" é saudação', (text: string) => {
        expect(prefilterOf(text)).toBe('greeting');
    });

    it.each([
        'quanto gastei com pix?',
        'how much did I spend with pix last month?',
        'quanto gastei com delivery em setembro?',
        'como está minha carteira?',
        'quanto paguei de boleto em outubro?',
        'oi, quanto gastei com mercado?',
        'Me lembra de pagar o condomínio todo dia 12',
        'me lembra de pagar o boleto da escola dia 10',
        'remind me to pay the rent on the 5th'
    ])('"%s" vai ao modelo', (text: string) => {
        expect(prefilterOf(text)).toBeNull();
    });
});
