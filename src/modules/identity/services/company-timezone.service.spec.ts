import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyDomain } from '../domain/company.domain';
import { CompanyTimezoneService } from './company-timezone.service';

const LATE_NIGHT_UTC: Date = new Date('2026-03-10T01:30:00.000Z');

function service(companyId: string | undefined, timezone: string | null): CompanyTimezoneService {
    const companies = { findById: vi.fn().mockResolvedValue(timezone === null ? null : { timezone }) };
    const context = { get: vi.fn().mockReturnValue({ requestId: 'req', companyId, locale: 'pt-BR' }) };
    return new CompanyTimezoneService(companies as unknown as CompanyDomain, context as unknown as AppContext);
}

describe('CompanyTimezoneService', () => {
    it('returns the calendar day in the timezone of the company', async () => {
        expect(await service('company-1', 'America/Sao_Paulo').todayInCompany(LATE_NIGHT_UTC)).toBe('2026-03-09');
        expect(await service('company-1', 'Asia/Tokyo').todayInCompany(LATE_NIGHT_UTC)).toBe('2026-03-10');
    });

    it('falls back to the Brazil timezone when the company is not found', async () => {
        expect(await service('company-1', null).todayInCompany(LATE_NIGHT_UTC)).toBe('2026-03-09');
        expect(await service(undefined, null).todayInCompany(LATE_NIGHT_UTC)).toBe('2026-03-09');
    });
});
