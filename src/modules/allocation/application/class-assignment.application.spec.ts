import { describe, expect, it, vi } from 'vitest';
import { makeAssignment, makeClass } from '../../../../test/support/allocation-factories';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { AssignmentNotFoundError, ClassNotFoundError } from '../domain/allocation.errors';
import { AllocationLogService } from '../services/allocation-log.service';
import { ClassAssignmentApplication } from './class-assignment.application';

function build(
    classFound: boolean,
    assignmentFound: boolean
): { application: ClassAssignmentApplication; reassign: ReturnType<typeof vi.fn> } {
    const reassign: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockResolvedValue(assignmentFound ? makeAssignment({ classId: 'class-x', subjectId: 'subject-1' }) : null);
    const application: ClassAssignmentApplication = new ClassAssignmentApplication(
        { findById: vi.fn().mockResolvedValue(classFound ? makeClass({ id: 'class-x' }) : null) } as unknown as AssetClassDomain,
        { reassign } as unknown as ClassAssignmentDomain,
        { assignmentChanged: vi.fn() } as unknown as AllocationLogService
    );
    return { application, reassign };
}

describe('ClassAssignmentApplication.reassign', () => {
    it('troca a classe e devolve a atribuição sem campos internos', async () => {
        const { application } = build(true, true);

        const view = await application.reassign('position', 'subject-1', 'class-x');

        expect(view).toEqual({ subjectType: 'position', subjectId: 'subject-1', classId: 'class-x', targetInClassBps: 0 });
    });

    it('classe inexistente lança class_not_found antes de tocar na atribuição', async () => {
        const { application, reassign } = build(false, true);

        await expect(application.reassign('position', 'subject-1', 'class-x')).rejects.toBeInstanceOf(ClassNotFoundError);
        expect(reassign).not.toHaveBeenCalled();
    });

    it('atribuição inexistente lança assignment_not_found', async () => {
        const { application } = build(true, false);

        await expect(application.reassign('position', 'subject-1', 'class-x')).rejects.toBeInstanceOf(AssignmentNotFoundError);
    });
});
