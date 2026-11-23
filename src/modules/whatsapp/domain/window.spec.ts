import { describe, expect, it } from 'vitest';
import { isRecipientAllowed } from './recipient-allowlist';
import { statusesBefore } from './message-status';
import { isWindowOpen } from './window';

const HOUR_MS: number = 3_600_000;
const NOW: Date = new Date('2026-11-20T12:00:00.000Z');

describe('isWindowOpen', () => {
    it('fica aberta no limite exato de 24 horas e fecha 1 ms depois', () => {
        expect(isWindowOpen(new Date(NOW.getTime() - 24 * HOUR_MS), NOW)).toBe(true);
        expect(isWindowOpen(new Date(NOW.getTime() - 24 * HOUR_MS - 1), NOW)).toBe(false);
    });

    it('fica fechada sem mensagem recebida', () => {
        expect(isWindowOpen(null, NOW)).toBe(false);
    });
});

describe('isRecipientAllowed', () => {
    it('aceita qualquer número com *', () => {
        expect(isRecipientAllowed(['*'], '5511999990000')).toBe(true);
    });

    it('compara só os dígitos', () => {
        expect(isRecipientAllowed(['5511999990000'], '+55 11 99999-0000')).toBe(true);
        expect(isRecipientAllowed(['5511999990000'], '5511888880000')).toBe(false);
    });
});

describe('statusesBefore', () => {
    it('só avança: delivered vem de sending e sent, read também de delivered', () => {
        expect(statusesBefore('delivered')).toEqual(['sending', 'sent']);
        expect(statusesBefore('read')).toEqual(['sending', 'sent', 'delivered']);
    });

    it('failed vem de sending ou sent, e o que não é status de entrega não avança nada', () => {
        expect(statusesBefore('failed')).toEqual(['sending', 'sent']);
        expect(statusesBefore('queued')).toEqual([]);
    });
});
