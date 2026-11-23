import { describe, expect, it } from 'vitest';
import { featureStateOf } from './feature-state';

describe('featureStateOf', () => {
    it('disabled vem antes de tudo', () => {
        expect(featureStateOf({ enabled: false, hasCapability: false, paused: true })).toBe('disabled');
    });

    it('sem capacidade pede o premium, antes de pausar', () => {
        expect(featureStateOf({ enabled: true, hasCapability: false, paused: true })).toBe('premium_required');
    });

    it('com capacidade, pausa quando a cota acabou', () => {
        expect(featureStateOf({ enabled: true, hasCapability: true, paused: true })).toBe('paused');
    });

    it('com tudo em ordem, está disponível', () => {
        expect(featureStateOf({ enabled: true, hasCapability: true, paused: false })).toBe('available');
    });
});
