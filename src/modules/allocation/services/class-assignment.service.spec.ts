import { describe, expect, it, vi } from 'vitest';
import { makeAssignment, makeClass } from '../../../../test/support/allocation-factories';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { AssignmentNotFoundError, ClassNotFoundError } from '../domain/allocation.errors';
import { AllocationLogService } from './allocation-log.service';
import { ClassAssignmentService } from './class-assignment.service';

interface Doubles {
    readonly service: ClassAssignmentService;
    readonly assign: ReturnType<typeof vi.fn>;
    readonly release: ReturnType<typeof vi.fn>;
    readonly assignmentChanged: ReturnType<typeof vi.fn>;
    readonly assignmentReleased: ReturnType<typeof vi.fn>;
}

function build(classExists: boolean, released: boolean = true): Doubles {
    const assign: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeAssignment());
    const release: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(released);
    const assignmentChanged: ReturnType<typeof vi.fn> = vi.fn();
    const assignmentReleased: ReturnType<typeof vi.fn> = vi.fn();
    const service: ClassAssignmentService = new ClassAssignmentService(
        { findById: vi.fn().mockResolvedValue(classExists ? makeClass({ id: 'class-x' }) : null) } as unknown as AssetClassDomain,
        { assign, release, listAll: vi.fn().mockResolvedValue([makeAssignment()]) } as unknown as ClassAssignmentDomain,
        { assignmentChanged, assignmentReleased } as unknown as AllocationLogService
    );
    return { service, assign, release, assignmentChanged, assignmentReleased };
}

describe('ClassAssignmentService', () => {
    it('grava a atribuição e registra o log', async () => {
        const doubles: Doubles = build(true);

        await doubles.service.assign('position', 'subject-1', 'class-x');

        expect(doubles.assign).toHaveBeenCalledWith('position', 'subject-1', 'class-x', false);
        expect(doubles.assignmentChanged).toHaveBeenCalledWith('position', 'subject-1', 'class-x');
    });

    it('repassa o marcador de exemplo ao domínio', async () => {
        const doubles: Doubles = build(true);

        await doubles.service.assign('fixed_income', 'subject-1', 'class-x', true);

        expect(doubles.assign).toHaveBeenCalledWith('fixed_income', 'subject-1', 'class-x', true);
    });

    it('classe inexistente (ou de outra company) lança class_not_found sem gravar', async () => {
        const doubles: Doubles = build(false);

        await expect(doubles.service.assign('fixed_income', 'subject-1', 'class-y')).rejects.toBeInstanceOf(ClassNotFoundError);
        expect(doubles.assign).not.toHaveBeenCalled();
    });

    it('libera a atribuição e só loga quando havia o que liberar', async () => {
        const doubles: Doubles = build(true);
        await doubles.service.release('position', 'subject-1');
        expect(doubles.assignmentReleased).toHaveBeenCalledWith('position', 'subject-1');

        const nothing: Doubles = build(true, false);
        await nothing.service.release('position', 'subject-2');
        expect(nothing.assignmentReleased).not.toHaveBeenCalled();
    });

    it('lista as atribuições da company', async () => {
        await expect(build(true).service.listForCompany()).resolves.toHaveLength(1);
    });

    it('requireClassId devolve a classe da atribuição e lança assignment_not_found sem ela', async () => {
        const find: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValueOnce(makeAssignment({ classId: 'class-x' }))
            .mockResolvedValueOnce(null);
        const service: ClassAssignmentService = new ClassAssignmentService(
            {} as unknown as AssetClassDomain,
            { find } as unknown as ClassAssignmentDomain,
            {} as unknown as AllocationLogService
        );

        await expect(service.requireClassId('position', 's1')).resolves.toBe('class-x');
        await expect(service.requireClassId('position', 's2')).rejects.toBeInstanceOf(AssignmentNotFoundError);
    });
});
