import { describe, expect, it } from 'vitest';
import { brlToMicros, scaleMicros, usdToMicros } from './usage-conversion';

describe('usage-conversion', () => {
    it('converte USD em micros de BRL pela taxa', () => {
        expect(usdToMicros('0.10', '5.5')).toBe(550_000);
        expect(usdToMicros('1', '5.4321')).toBe(5_432_100);
    });

    it('arredonda meio para cima', () => {
        expect(usdToMicros('0.0000005', '1')).toBe(1);
        expect(usdToMicros('0.0000004', '1')).toBe(0);
        expect(scaleMicros(5, 0.5)).toBe(3);
        expect(scaleMicros(4, 0.5)).toBe(2);
    });

    it('BRL vira micros direto e o multiplicador escala', () => {
        expect(brlToMicros('0.35')).toBe(350_000);
        expect(scaleMicros(350_000, 1)).toBe(350_000);
        expect(scaleMicros(350_000, 1.5)).toBe(525_000);
    });
});
