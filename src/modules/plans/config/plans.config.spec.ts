import { afterEach, describe, expect, it, vi } from 'vitest';
import { plansConfig } from './plans.config';

describe('plansConfig', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('falha fora do local sem DEPLOYMENT_MODE', () => {
        vi.stubEnv('IS_LOCAL', 'false');
        vi.stubEnv('DEPLOYMENT_MODE', '');

        expect(() => plansConfig()).toThrow();
    });

    it('assume hosted no local', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('DEPLOYMENT_MODE', undefined);

        expect(plansConfig().DEPLOYMENT_MODE).toBe('hosted');
    });

    it('aceita self_hosted', () => {
        vi.stubEnv('IS_LOCAL', 'false');
        vi.stubEnv('DEPLOYMENT_MODE', 'self_hosted');

        expect(plansConfig()).toEqual({ DEPLOYMENT_MODE: 'self_hosted' });
    });
});
