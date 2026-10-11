import { describe, expect, it, vi } from 'vitest';
import { makeAssignment } from '../../../../test/support/allocation-factories';
import { ClassAssignmentsRepository } from '../repositories/class-assignments.repository';
import { ClassAssignmentDomain } from './class-assignment.domain';

function build(repository: Record<string, ReturnType<typeof vi.fn>>): ClassAssignmentDomain {
    return new ClassAssignmentDomain(repository as unknown as ClassAssignmentsRepository);
}

describe('ClassAssignmentDomain.assign', () => {
    it('cria a atribuição quando o ativo ainda não tem', async () => {
        const created = makeAssignment();
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(created);

        const result = await build({ findBySubject: vi.fn().mockResolvedValue(null), create }).assign('position', 's1', 'c1');

        expect(create).toHaveBeenCalledWith({ subjectType: 'position', subjectId: 's1', classId: 'c1', isSample: false });
        expect(result).toBe(created);
    });

    it('marca a atribuição como exemplo quando pedido', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeAssignment());

        await build({ findBySubject: vi.fn().mockResolvedValue(null), create }).assign('fixed_income', 's1', 'c1', true);

        expect(create).toHaveBeenCalledWith({ subjectType: 'fixed_income', subjectId: 's1', classId: 'c1', isSample: true });
    });

    it('mesma classe não mexe na atribuição nem zera a meta', async () => {
        const current = makeAssignment({ classId: 'c1', targetInClassBps: 3000 });
        const changeClass: ReturnType<typeof vi.fn> = vi.fn();

        const result = await build({ findBySubject: vi.fn().mockResolvedValue(current), changeClass }).assign('position', 's1', 'c1');

        expect(changeClass).not.toHaveBeenCalled();
        expect(result.targetInClassBps).toBe(3000);
    });

    it('classe diferente troca a classe', async () => {
        const moved = makeAssignment({ classId: 'c2' });
        const changeClass: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(moved);

        const result = await build({ findBySubject: vi.fn().mockResolvedValue(makeAssignment({ classId: 'c1' })), changeClass }).assign(
            'position',
            's1',
            'c2'
        );

        expect(result).toBe(moved);
    });

    it('se a troca não devolver linha, mantém a atribuição atual', async () => {
        const current = makeAssignment({ classId: 'c1' });

        const result = await build({
            findBySubject: vi.fn().mockResolvedValue(current),
            changeClass: vi.fn().mockResolvedValue(null)
        }).assign('position', 's1', 'c2');

        expect(result).toBe(current);
    });
});

describe('ClassAssignmentDomain.reassign', () => {
    it('devolve null quando não há atribuição', async () => {
        await expect(build({ findBySubject: vi.fn().mockResolvedValue(null) }).reassign('position', 's1', 'c1')).resolves.toBeNull();
    });

    it('troca a classe de uma atribuição existente', async () => {
        const moved = makeAssignment({ classId: 'c2' });

        const result = await build({
            findBySubject: vi.fn().mockResolvedValue(makeAssignment({ classId: 'c1' })),
            changeClass: vi.fn().mockResolvedValue(moved)
        }).reassign('position', 's1', 'c2');

        expect(result).toBe(moved);
    });
});

describe('ClassAssignmentDomain.release', () => {
    it('libera a atribuição existente e informa', async () => {
        const current = makeAssignment();
        const softDelete: ReturnType<typeof vi.fn> = vi.fn();

        await expect(build({ findBySubject: vi.fn().mockResolvedValue(current), softDelete }).release('position', 's1')).resolves.toBe(
            true
        );
        expect(softDelete).toHaveBeenCalledWith(current.id);
    });

    it('sem atribuição devolve false', async () => {
        await expect(build({ findBySubject: vi.fn().mockResolvedValue(null) }).release('position', 's1')).resolves.toBe(false);
    });
});

describe('ClassAssignmentDomain delegations', () => {
    it('lista, move e aplica metas pelo repositório', async () => {
        const repository: Record<string, ReturnType<typeof vi.fn>> = {
            listAll: vi.fn().mockResolvedValue([makeAssignment()]),
            listByClass: vi.fn().mockResolvedValue([]),
            existsInClass: vi.fn().mockResolvedValue(true),
            moveAll: vi.fn(),
            setTargetInClass: vi.fn()
        };
        const domain: ClassAssignmentDomain = build(repository);

        await expect(domain.listAll()).resolves.toHaveLength(1);
        await expect(domain.listByClass('c1')).resolves.toEqual([]);
        await expect(domain.classHasAssignments('c1')).resolves.toBe(true);
        await domain.moveAll('c1', 'c2');
        await domain.applyTargets([
            { assignmentId: 'a1', targetInClassBps: 100 },
            { assignmentId: 'a2', targetInClassBps: 200 }
        ]);

        expect(repository['moveAll']).toHaveBeenCalledWith('c1', 'c2');
        expect(repository['setTargetInClass']).toHaveBeenCalledTimes(2);
    });
});
