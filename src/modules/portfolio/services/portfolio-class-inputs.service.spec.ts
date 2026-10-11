import { describe, expect, it, vi } from 'vitest';
import { makeAssignment, makeClass } from '../../../../test/support/allocation-factories';
import { AppContext } from '../../../core/context/app-context.port';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassDisplayNameService } from '../../allocation/services/class-display-name.service';
import { ClassReaderService } from '../../allocation/services/class-reader.service';
import { PortfolioSettingsReaderService } from '../../allocation/services/portfolio-settings-reader.service';
import { PortfolioClassInputsService } from './portfolio-class-inputs.service';

describe('PortfolioClassInputsService', () => {
    it('maps classes with the display name in the request locale, the assignments and the settings', async () => {
        const rfPos = makeClass({ id: 'c1', systemKey: 'rf_pos', name: null, targetBps: 2000, sortOrder: 1 });
        const custom = makeClass({ id: 'c2', name: 'Imóveis', targetBps: 8000, sortOrder: 2 });
        const assignment = makeAssignment({ subjectType: 'position', subjectId: 'p1', classId: 'c1', targetInClassBps: 500 });
        const service: PortfolioClassInputsService = new PortfolioClassInputsService(
            { listForCompany: vi.fn().mockResolvedValue([rfPos, custom]) } as unknown as ClassReaderService,
            new ClassDisplayNameService(),
            { listForCompany: vi.fn().mockResolvedValue([assignment]) } as unknown as ClassAssignmentService,
            { get: vi.fn().mockResolvedValue({ baseCurrency: 'USD', toleranceBps: 300 }) } as unknown as PortfolioSettingsReaderService,
            { get: vi.fn().mockReturnValue({ requestId: 'r', locale: 'en' }) } as unknown as AppContext
        );

        const inputs = await service.load();

        expect(inputs.baseCurrency).toBe('USD');
        expect(inputs.toleranceBps).toBe(300);
        expect(inputs.classes.map((item) => item.displayName)).toEqual(['Floating-rate fixed income', 'Imóveis']);
        expect(inputs.assignments).toEqual([{ subjectType: 'position', subjectId: 'p1', classId: 'c1', targetInClassBps: 500 }]);
    });
});
