import { describe, expect, it, vi } from 'vitest';
import { PlatformAvailabilityService } from '../../identity/services/platform-availability.service';
import { SignupLinkDomain } from '../domain/signup-link.domain';
import { SignupLinkNotFoundError } from '../domain/signup-links.errors';
import { SignupLink } from '../domain/signup-links.types';
import { SignupLinkViewMapper } from '../services/signup-link-view.mapper';
import { SignupLinksPublicApplication } from './signup-links-public.application';

const LINK: SignupLink = {
    id: 'id',
    token: 'token',
    label: 'Interno',
    trialKind: 'none',
    trialDays: null,
    rules: [],
    maxUses: null,
    expiresAt: null,
    offerValidityDays: 30,
    redemptionCount: 0,
    trialCount: 0,
    subscriptionCount: 0,
    revokedAt: null,
    createdByUserId: null,
    createdAt: new Date('2026-11-23T12:00:00.000Z'),
    updatedAt: new Date('2026-11-23T12:00:00.000Z')
};

function applicationWith(enabled: boolean): { application: SignupLinksPublicApplication; findByToken: ReturnType<typeof vi.fn> } {
    const findByToken: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(LINK);
    const application: SignupLinksPublicApplication = new SignupLinksPublicApplication(
        { findByToken } as unknown as SignupLinkDomain,
        { enabled: () => enabled } as unknown as PlatformAvailabilityService,
        new SignupLinkViewMapper({ APP_URL: 'https://app.example.test', SIGNUP_EMAIL_MARK_HMAC_KEY: null, SIGNUP_REDEEM_IP_DAILY_LIMIT: 5 })
    );
    return { application, findByToken };
}

describe('SignupLinksPublicApplication', () => {
    it('na auto-hospedada o link é ignorado: 404 sem nem consultar o banco', async () => {
        const { application, findByToken } = applicationWith(false);

        await expect(application.offerOf('token')).rejects.toBeInstanceOf(SignupLinkNotFoundError);
        expect(findByToken).not.toHaveBeenCalled();
    });

    it('devolve só a oferta, sem rótulo nem contadores', async () => {
        const { application } = applicationWith(true);

        await expect(application.offerOf('token')).resolves.toEqual({ trial: { kind: 'none', days: null }, rules: [], expiresAt: null });
    });
});
