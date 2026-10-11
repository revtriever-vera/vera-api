import { describe, expect, it, vi } from 'vitest';
import { OnboardingSampleApplication } from '../application/onboarding-sample.application';
import { OnboardingStateView } from '../application/onboarding-state.view';
import { OnboardingSampleController } from './onboarding-sample.controller';

const VIEW: OnboardingStateView = {
    status: 'closed',
    startedAt: null,
    steps: { assets: { doneAt: null, skippedAt: null }, banks: { doneAt: null, skippedAt: null } },
    completedAt: null,
    dismissedAt: null,
    sample: { active: true, available: true }
};

describe('OnboardingSampleController', () => {
    it('delega carregar e limpar à application', async () => {
        const load: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(VIEW);
        const clear: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(VIEW);
        const controller: OnboardingSampleController = new OnboardingSampleController({
            load,
            clear
        } as unknown as OnboardingSampleApplication);

        await expect(controller.load()).resolves.toBe(VIEW);
        await expect(controller.clear()).resolves.toBe(VIEW);
        expect(load).toHaveBeenCalledOnce();
        expect(clear).toHaveBeenCalledOnce();
    });
});
