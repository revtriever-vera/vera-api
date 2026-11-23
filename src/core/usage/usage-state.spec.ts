import { describe, expect, it } from 'vitest';
import { usageStateOf } from './usage-state';

const RESETS_AT: Date = new Date('2026-11-01T03:00:00.000Z');

function stateOf(capMicros: number | null, ai: number, whatsapp: number = 0, warningBps: number = 8000, minRoomMicros: number = 0): ReturnType<typeof usageStateOf> {
    return usageStateOf({ period: '2026-10', resetsAt: RESETS_AT, capMicros, byFeatureMicros: { ai, whatsapp }, warningBps, minRoomMicros });
}

describe('usageStateOf', () => {
    it('fica ok abaixo do aviso', () => {
        expect(stateOf(4_000_000, 3_199_999)).toMatchObject({ state: 'ok', usedBps: 7999 });
    });

    it('avisa exatamente em 80% e pausa exatamente em 100%', () => {
        expect(stateOf(4_000_000, 3_200_000).state).toBe('warning');
        expect(stateOf(4_000_000, 3_999_999).state).toBe('warning');
        expect(stateOf(4_000_000, 4_000_000).state).toBe('paused');
        expect(stateOf(4_000_000, 5_000_000)).toMatchObject({ state: 'paused', usedBps: 12500 });
    });

    it('soma as funções e devolve o bps de cada uma', () => {
        expect(stateOf(4_000_000, 2_000_000, 1_200_000)).toMatchObject({
            usedMicros: 3_200_000,
            usedBps: 8000,
            byFeature: { ai: 5000, whatsapp: 3000 },
            state: 'warning',
            resetsAt: '2026-11-01T03:00:00.000Z'
        });
    });

    it('sem teto, ou com teto 0, é sempre ok com bps zero', () => {
        expect(stateOf(null, 9_000_000)).toMatchObject({ state: 'ok', usedBps: 0, capMicros: null, byFeature: { ai: 0, whatsapp: 0 } });
        expect(stateOf(0, 9_000_000)).toMatchObject({ state: 'ok', usedBps: 0, capMicros: null });
    });

    it('respeita um limite de aviso configurado', () => {
        expect(stateOf(1_000_000, 500_000, 0, 5000).state).toBe('warning');
    });

    it('pausa quando o que resta é menor que o piso de uma chamada, antes de chegar em 100%', () => {
        expect(stateOf(4_000_000, 3_979_999, 0, 8000, 20_000).state).toBe('warning');
        expect(stateOf(4_000_000, 3_980_000, 0, 8000, 20_000)).toMatchObject({ state: 'paused', usedBps: 9950 });
        expect(stateOf(4_000_000, 3_998_800, 0, 8000, 20_000).state).toBe('paused');
    });

    it('o piso nunca pausa antes da faixa de aviso, mesmo com teto menor que o piso', () => {
        expect(stateOf(10_000, 0, 0, 8000, 20_000).state).toBe('ok');
        expect(stateOf(10_000, 8_000, 0, 8000, 20_000).state).toBe('paused');
    });
});
