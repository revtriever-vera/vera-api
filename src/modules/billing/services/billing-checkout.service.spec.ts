import { describe, expect, it, vi } from 'vitest';
import { PlatformCompanyCannotSubscribeError } from '../domain/billing-engine.errors';
import { BillingCheckoutService } from './billing-checkout.service';

describe('BillingCheckoutService.subscribe', () => {
    it('recusa a company de sistema antes de reservar qualquer assinatura', async () => {
        const forSubscribe: ReturnType<typeof vi.fn> = vi.fn();
        const service: BillingCheckoutService = new BillingCheckoutService(
            { BILLING_ENGINE_ENABLED: true } as never,
            { mode: () => 'hosted' } as never,
            { isPlatformCompany: vi.fn().mockResolvedValue(true) } as never,
            {} as never,
            {} as never,
            { forSubscribe } as never,
            {} as never,
            {} as never
        );

        await expect(service.subscribe('pix')).rejects.toBeInstanceOf(PlatformCompanyCannotSubscribeError);
        expect(forSubscribe).not.toHaveBeenCalled();
    });
});
