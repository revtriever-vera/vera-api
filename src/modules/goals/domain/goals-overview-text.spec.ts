import { describe, expect, it } from 'vitest';
import { overviewText } from './goals-overview-text';

describe('overviewText', () => {
    it('lista cada objetivo com saldo, alvo, percentual e situação', () => {
        const text: string = overviewText(
            [
                { name: 'Reserva de emergência', targetMinor: 3_120_000, balanceMinor: 2_232_000, status: 'on_track' },
                { name: 'Viagem', targetMinor: 1_200_000, balanceMinor: 100_000, status: 'behind' }
            ],
            'pt-BR'
        );

        expect(text).toBe(
            [
                'Seus objetivos:',
                '- Reserva de emergência: R$ 22.320 / R$ 31.200 (71%). Em dia.',
                '- Viagem: R$ 1.000 / R$ 12.000 (8%). Atrasado.'
            ].join('\n')
        );
    });

    it('limita o percentual a 100 e fala inglês', () => {
        const text: string = overviewText([{ name: 'Trip', targetMinor: 100_000, balanceMinor: 250_000, status: 'done' }], 'en');

        expect(text).toBe('Your goals:\n- Trip: R$2,500 / R$1,000 (100%). Done.');
    });

    it('sem objetivos orienta a criar o primeiro', () => {
        expect(overviewText([], 'pt-BR')).toContain('Carteira > Objetivos');
        expect(overviewText([], 'en')).toContain('Portfolio > Goals');
    });
});
