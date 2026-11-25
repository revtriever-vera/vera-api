import { describe, expect, it } from 'vitest';
import { UsageState } from '../../../core/usage/usage.types';
import { investmentNoticeText } from '../../ai-assistant/services/ask-vera.service';
import { retentionCutoffOf, sentAvailableOf, sentOf, splitNotice, toolsOf, usageViewOf } from './turn-view';

const STATE: UsageState = {
    period: '2026-11',
    capMicros: 4_000_000,
    usedMicros: 1_000_000,
    usedBps: 2500,
    byFeature: { ai: 2500, whatsapp: 0, help: 0 },
    state: 'ok',
    resetsAt: '2026-12-01T03:00:00.000Z',
    help: { separate: true, capMicros: 500_000, usedMicros: 450_000, usedBps: 9000, state: 'warning' }
};

describe('turn-view', () => {
    it('separa a linha de aviso de investimento do texto, em qualquer idioma', () => {
        const line: string = investmentNoticeText('en');

        expect(splitNotice(`Resposta.\n${line}`)).toEqual({ text: 'Resposta.', notice: line });
        expect(splitNotice('Sem aviso.')).toEqual({ text: 'Sem aviso.', notice: null });
    });

    it('lê as ferramentas e se há o que foi enviado', () => {
        expect(toolsOf({ toolsUsed: ['help_search'] })).toEqual(['help_search']);
        expect(toolsOf({ toolsUsed: 'x' })).toEqual([]);
        expect(sentAvailableOf({ sent: [{ tool: 'a' }] })).toBe(true);
        expect(sentAvailableOf({ sent: [] })).toBe(false);
        expect(sentAvailableOf({ sent: null })).toBe(false);
    });

    it('mostra a faixa do modo: ajuda pelo teto próprio, ai pelo total', () => {
        expect(usageViewOf(STATE, 'help')).toEqual({ state: 'warning', usedBps: 9000, resetsAt: STATE.resetsAt });
        expect(usageViewOf(STATE, 'ai')).toEqual({ state: 'ok', usedBps: 2500, resetsAt: STATE.resetsAt });
    });

    it('calcula o corte da retenção em dias', () => {
        expect(retentionCutoffOf(new Date('2026-12-01T00:00:00.000Z'), 30).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });

    it('devolve o que foi enviado como está, e lista vazia sem nada gravado', () => {
        const sent = [{ tool: 'portfolio_overview', payload: { total: 'R$ 1.000' } }];

        expect(sentOf({ sent })).toEqual(sent);
        expect(sentOf({ sent: null })).toEqual([]);
    });
});
