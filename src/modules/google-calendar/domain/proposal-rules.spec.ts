import { describe, expect, it } from 'vitest';
import { evaluateProposal, googleEventIdOf, startsInFuture } from './proposal-rules';

const ZONE: string = 'America/Sao_Paulo';
const NOW: Date = new Date('2026-11-23T12:00:00.000Z');

describe('evaluateProposal', () => {
    it('resolve o horário local no fuso da company e usa 60 minutos por padrão', () => {
        const result = evaluateProposal(
            { title: ' Revisão  da carteira ', start: '2026-11-27T15:00', durationMinutes: undefined },
            ZONE,
            NOW
        );

        expect(result).toEqual({
            status: 'proposed',
            title: 'Revisão da carteira',
            start: new Date('2026-11-27T18:00:00.000Z'),
            end: new Date('2026-11-27T19:00:00.000Z')
        });
    });

    it('respeita o deslocamento explícito e a duração pedida', () => {
        const result = evaluateProposal({ title: 'Call', start: '2026-11-27T15:00:00-05:00', durationMinutes: 30 }, ZONE, NOW);

        expect(result).toMatchObject({
            status: 'proposed',
            start: new Date('2026-11-27T20:00:00.000Z'),
            end: new Date('2026-11-27T20:30:00.000Z')
        });
    });

    it('converte o fuso com horário de verão', () => {
        const result = evaluateProposal({ title: 'Call', start: '2026-12-01T09:00', durationMinutes: undefined }, 'America/New_York', NOW);

        expect(result).toMatchObject({ start: new Date('2026-12-01T14:00:00.000Z') });
    });

    it('pede o horário quando falta o dia ou a hora', () => {
        expect(evaluateProposal({ title: 'Call', start: undefined, durationMinutes: undefined }, ZONE, NOW)).toEqual({
            status: 'needs_time'
        });
        expect(evaluateProposal({ title: 'Call', start: '2026-11-27', durationMinutes: undefined }, ZONE, NOW)).toEqual({
            status: 'needs_time'
        });
        expect(evaluateProposal({ title: 'Call', start: 'semana que vem', durationMinutes: undefined }, ZONE, NOW)).toEqual({
            status: 'needs_time'
        });
        expect(evaluateProposal({ title: 'Call', start: '2026-13-40T25:99', durationMinutes: undefined }, ZONE, NOW)).toEqual({
            status: 'needs_time'
        });
    });

    it('recusa o passado e o título vazio', () => {
        expect(evaluateProposal({ title: 'Call', start: '2026-11-22T10:00', durationMinutes: undefined }, ZONE, NOW)).toEqual({
            status: 'invalid',
            reason: 'past'
        });
        expect(evaluateProposal({ title: '   ', start: '2026-11-27T10:00', durationMinutes: undefined }, ZONE, NOW)).toEqual({
            status: 'invalid',
            reason: 'title'
        });
    });
});

describe('startsInFuture', () => {
    it('vale até o horário de início', () => {
        const payload = {
            proposalId: 'p',
            userId: 'u',
            title: 't',
            start: '2026-11-23T13:00:00.000Z',
            end: '2026-11-23T14:00:00.000Z',
            timeZone: ZONE
        };

        expect(startsInFuture(payload, NOW)).toBe(true);
        expect(startsInFuture(payload, new Date('2026-11-23T13:00:00.000Z'))).toBe(false);
    });
});

describe('googleEventIdOf', () => {
    it('deriva o mesmo id da mesma proposta, em base32hex aceito pelo Google', () => {
        const id: string = googleEventIdOf('0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e90');

        expect(id).toBe(googleEventIdOf('0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e90'));
        expect(id).toMatch(/^vera[0-9a-v]{32}$/);
        expect(googleEventIdOf('outra-proposta')).not.toBe(id);
    });
});
