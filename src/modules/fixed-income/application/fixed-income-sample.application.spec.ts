import { describe, expect, it, vi } from 'vitest';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import { makeTitle } from '../../../../test/support/fixed-income-fixtures';
import { FixedIncomeSampleApplication } from './fixed-income-sample.application';

function build(options: { real?: number; samples?: number } = {}) {
    const titles = {
        listReal: vi.fn().mockResolvedValue(Array.from({ length: options.real ?? 0 }, () => makeTitle())),
        listSamples: vi
            .fn()
            .mockResolvedValue(
                Array.from({ length: options.samples ?? 0 }, (_, index: number) => makeTitle({ id: `sample-${String(index)}` }))
            ),
        createSample: vi.fn().mockImplementation((draft: { name: string }) => Promise.resolve(makeTitle({ id: draft.name }))),
        removeSamples: vi.fn().mockResolvedValue(2)
    };
    const resolver = { resolveBySystemKey: vi.fn().mockImplementation((key: string) => Promise.resolve({ id: `class-${key}` })) };
    const assignments = { assign: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
    const application = new FixedIncomeSampleApplication(
        titles as unknown as FixedIncomeTitleDomain,
        resolver as unknown as ClassResolverService,
        assignments as unknown as ClassAssignmentService
    );
    return { application, titles, resolver, assignments };
}

describe('FixedIncomeSampleApplication', () => {
    it('semeia três títulos de exemplo, cada um na classe sugerida pelo indexador e marcado como exemplo', async () => {
        const { application, titles, assignments } = build();

        await expect(application.seed()).resolves.toBe(3);

        expect(titles.createSample).toHaveBeenCalledTimes(3);
        expect(assignments.assign).toHaveBeenCalledWith('fixed_income', 'CDB Exemplo 110% CDI', 'class-rf_pos', true);
        expect(assignments.assign).toHaveBeenCalledWith('fixed_income', 'LCI Exemplo Pré 11,5%', 'class-rf_pre', true);
        expect(assignments.assign).toHaveBeenCalledWith('fixed_income', 'Debênture Exemplo IPCA+6%', 'class-rf_ipca', true);
    });

    it('não semeia quando já há título real', async () => {
        const { application, titles } = build({ real: 1 });

        await expect(application.seed()).resolves.toBe(0);
        expect(titles.createSample).not.toHaveBeenCalled();
    });

    it('não duplica quando o exemplo já foi carregado', async () => {
        const { application, titles } = build({ samples: 3 });

        await expect(application.seed()).resolves.toBe(0);
        expect(titles.createSample).not.toHaveBeenCalled();
    });

    it('limpa só o exemplo: libera as atribuições e apaga os títulos', async () => {
        const { application, assignments, titles } = build({ samples: 2 });

        await expect(application.clear()).resolves.toBe(2);

        expect(assignments.release).toHaveBeenCalledWith('fixed_income', 'sample-0');
        expect(assignments.release).toHaveBeenCalledWith('fixed_income', 'sample-1');
        expect(titles.removeSamples).toHaveBeenCalledTimes(1);
    });
});
