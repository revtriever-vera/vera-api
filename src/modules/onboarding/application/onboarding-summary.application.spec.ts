import { describe, expect, it, vi } from 'vitest';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { OnboardingAreaRegistry } from '../services/onboarding-area.registry';
import { OnboardingSummaryApplication } from './onboarding-summary.application';

describe('OnboardingSummaryApplication', () => {
    it('resume com a company do usuário da sessão', async () => {
        const summarize: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ assets: null, banks: null, target: null });
        const application: OnboardingSummaryApplication = new OnboardingSummaryApplication(
            { require: vi.fn().mockResolvedValue({ companyId: 'company-1' }) } as unknown as CurrentUserService,
            { summarize } as unknown as OnboardingAreaRegistry
        );

        await expect(application.summary()).resolves.toEqual({ assets: null, banks: null, target: null });
        expect(summarize).toHaveBeenCalledWith('company-1');
    });
});
