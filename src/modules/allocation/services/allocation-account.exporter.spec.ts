import { describe, expect, it, vi } from 'vitest';
import { makeAssignment, makeClass } from '../../../../test/support/allocation-factories';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { PortfolioSettingsDomain } from '../domain/portfolio-settings.domain';
import { AllocationAccountExporter } from './allocation-account.exporter';

function build(settings: unknown) {
    return new AllocationAccountExporter(
        {
            listActive: vi.fn().mockResolvedValue([makeClass({ id: 'c1', systemKey: 'rf_pos', targetBps: 10000 })])
        } as unknown as AssetClassDomain,
        {
            listAll: vi
                .fn()
                .mockResolvedValue([
                    makeAssignment({ subjectId: 'real', classId: 'c1', targetInClassBps: 4000 }),
                    makeAssignment({ subjectId: 'sample', classId: 'c1', isSample: true })
                ])
        } as unknown as ClassAssignmentDomain,
        { current: vi.fn().mockResolvedValue(settings) } as unknown as PortfolioSettingsDomain
    );
}

describe('AllocationAccountExporter', () => {
    it('exporta classes, metas por ativo (sem exemplo) e preferências', async () => {
        const exported = await build({ baseCurrency: 'USD', toleranceBps: 300 }).exportAll();

        expect(exported.settings).toEqual({ baseCurrency: 'USD', toleranceBps: 300 });
        expect(exported.classes).toMatchObject([{ id: 'c1', systemKey: 'rf_pos', targetBps: 10000 }]);
        expect(exported.assetTargets).toEqual([{ subjectType: 'position', subjectId: 'real', classId: 'c1', targetInClassBps: 4000 }]);
    });

    it('sem preferências gravadas, exporta os padrões sem escrever nada', async () => {
        const exported = await build(null).exportAll();

        expect(exported.settings).toEqual({ baseCurrency: 'BRL', toleranceBps: 500 });
    });
});
