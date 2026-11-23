import { describe, expect, it } from 'vitest';
import { objectivesOf } from './objectives-need';

describe('objectivesOf', () => {
    it('converte o valor mensal em bps da renda, arredondando para cima', () => {
        expect(objectivesOf(210_000, 1, 1_000_000)).toEqual({ monthlyNeededMinor: 210_000, behindCount: 1, asGoalBps: 2100 });
        expect(objectivesOf(1, 0, 3)).toMatchObject({ asGoalBps: 3334 });
    });

    it('limita ao máximo da meta de economia', () => {
        expect(objectivesOf(900_000, 3, 1_000_000).asGoalBps).toBe(9000);
    });

    it('sem renda não há percentual', () => {
        expect(objectivesOf(500_000, 1, 0).asGoalBps).toBeNull();
    });

    it('sem objetivos pedindo, o percentual é zero', () => {
        expect(objectivesOf(0, 0, 1_000_000).asGoalBps).toBe(0);
    });
});
