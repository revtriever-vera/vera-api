import { describe, expect, it, vi } from 'vitest';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanLimitDomain } from '../domain/plan-limit.domain';
import { CompanyProductLimit } from '../domain/plans.types';
import { PlanLimitService } from './plan-limit.service';

const CONFIGURED_MICROS: number = 4_000_000;

function build(mode: 'hosted' | 'self_hosted', own: readonly Partial<CompanyProductLimit>[]): PlanLimitService {
    const catalog = { productOf: vi.fn().mockResolvedValue({ id: 'product' }) } as unknown as PlanCatalogDomain;
    const limits = { companyLimits: vi.fn().mockResolvedValue(own) } as unknown as PlanLimitDomain;
    return new PlanLimitService({ DEPLOYMENT_MODE: mode }, catalog, limits);
}

describe('teto da cota de uso pago', () => {
    it('na hospedada, sem teto próprio, vale o configurado em PAID_USAGE_CAP_MICROS', async () => {
        expect(await build('hosted', []).capMicros(CONFIGURED_MICROS)).toBe(CONFIGURED_MICROS);
    });

    it('na hospedada, o teto próprio da company vale mais que o configurado', async () => {
        const own: Partial<CompanyProductLimit> = { quantity: '9000000', startsAt: new Date('2020-01-01'), endsAt: null };

        expect(await build('hosted', [own]).capMicros(CONFIGURED_MICROS)).toBe(9_000_000);
    });

    it('na hospedada, configurado em 0 significa sem teto', async () => {
        expect(await build('hosted', []).capMicros(null)).toBeNull();
    });

    it('na auto-hospedada não há cota, qualquer que seja o configurado', async () => {
        expect(await build('self_hosted', []).capMicros(CONFIGURED_MICROS)).toBeNull();
    });
});
