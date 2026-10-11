import { describe, expect, it, vi } from 'vitest';
import { OnboardingStateApplication } from '../application/onboarding-state.application';
import { OnboardingStateView } from '../application/onboarding-state.view';
import { OnboardingSummaryApplication } from '../application/onboarding-summary.application';
import { OnboardingController } from './onboarding.controller';

const VIEW: OnboardingStateView = {
    status: 'welcome',
    startedAt: null,
    steps: { assets: { doneAt: null, skippedAt: null }, banks: { doneAt: null, skippedAt: null } },
    completedAt: null,
    dismissedAt: null,
    sample: { active: false, available: false }
};

describe('OnboardingController', () => {
    it('delega cada rota à application certa', async () => {
        const state: Record<string, ReturnType<typeof vi.fn>> = {
            current: vi.fn().mockResolvedValue(VIEW),
            start: vi.fn().mockResolvedValue(VIEW),
            completeStep: vi.fn().mockResolvedValue(VIEW),
            skipStep: vi.fn().mockResolvedValue(VIEW),
            finish: vi.fn().mockResolvedValue(VIEW),
            dismiss: vi.fn().mockResolvedValue(VIEW)
        };
        const summary: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ assets: null, banks: null, target: null });
        const controller: OnboardingController = new OnboardingController(
            state as unknown as OnboardingStateApplication,
            { summary } as unknown as OnboardingSummaryApplication
        );

        await expect(controller.current()).resolves.toBe(VIEW);
        await expect(controller.start()).resolves.toBe(VIEW);
        await expect(controller.complete('assets')).resolves.toBe(VIEW);
        await expect(controller.skip('banks')).resolves.toBe(VIEW);
        await expect(controller.finish()).resolves.toBe(VIEW);
        await expect(controller.dismiss()).resolves.toBe(VIEW);
        await expect(controller.summary()).resolves.toEqual({ assets: null, banks: null, target: null });

        expect(state['completeStep']).toHaveBeenCalledWith('assets');
        expect(state['skipStep']).toHaveBeenCalledWith('banks');
    });
});
