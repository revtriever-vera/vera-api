import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAssignment, makeClass } from '../../../../test/support/allocation-factories';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { ClassNotFoundError, TargetsIncompleteError, TargetsMustSum100Error } from '../domain/allocation.errors';
import { AllocationLogService } from '../services/allocation-log.service';
import { AllocationMetricsService } from '../services/allocation-metrics.service';
import { ClassReaderService } from '../services/class-reader.service';
import { ClassTargetsApplication } from './class-targets.application';

const SUBJECT_A = '00000000-0000-4000-8000-00000000000a';
const SUBJECT_B = '00000000-0000-4000-8000-00000000000b';

interface Built {
    readonly application: ClassTargetsApplication;
    readonly applyClassTargets: ReturnType<typeof vi.fn>;
    readonly applyAssetTargets: ReturnType<typeof vi.fn>;
    readonly targetsSaved: ReturnType<typeof vi.fn>;
    readonly targetSave: ReturnType<typeof vi.fn>;
}

function build(options: { classFound?: boolean } = {}): Built {
    const classes = [
        makeClass({ id: 'a', systemKey: 'rf_pos', targetBps: 6000 }),
        makeClass({ id: 'b', systemKey: 'fii', targetBps: 4000 })
    ];
    const applyClassTargets: ReturnType<typeof vi.fn> = vi.fn();
    const applyAssetTargets: ReturnType<typeof vi.fn> = vi.fn();
    const targetsSaved: ReturnType<typeof vi.fn> = vi.fn();
    const targetSave: ReturnType<typeof vi.fn> = vi.fn();
    const application: ClassTargetsApplication = new ClassTargetsApplication(
        {
            applyTargets: applyClassTargets,
            findById: vi.fn().mockResolvedValue(options.classFound === false ? null : classes[0])
        } as unknown as AssetClassDomain,
        {
            listByClass: vi
                .fn()
                .mockResolvedValue([
                    makeAssignment({ id: 'x1', subjectId: SUBJECT_A, targetInClassBps: 0 }),
                    makeAssignment({ id: 'x2', subjectId: SUBJECT_B, targetInClassBps: 0 })
                ]),
            applyTargets: applyAssetTargets
        } as unknown as ClassAssignmentDomain,
        { listForCompany: vi.fn().mockResolvedValue(classes) } as unknown as ClassReaderService,
        { targetsSaved } as unknown as AllocationLogService,
        { targetSave } as unknown as AllocationMetricsService
    );
    return { application, applyClassTargets, applyAssetTargets, targetsSaved, targetSave };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('ClassTargetsApplication.saveClassTargets', () => {
    it('grava, registra log sem valores e conta como saved', async () => {
        const { application, applyClassTargets, targetsSaved, targetSave } = build();

        const views = await application.saveClassTargets([
            { classId: 'a', targetBps: 7000 },
            { classId: 'b', targetBps: 3000 }
        ]);

        expect(applyClassTargets).toHaveBeenCalledWith([
            { classId: 'a', targetBps: 7000 },
            { classId: 'b', targetBps: 3000 }
        ]);
        expect(views).toHaveLength(2);
        expect(targetsSaved).toHaveBeenCalledWith('classes', null);
        expect(targetSave).toHaveBeenCalledWith('classes', 'saved');
    });

    it('soma errada não grava nada e conta must_sum_100', async () => {
        const { application, applyClassTargets, targetSave } = build();

        await expect(application.saveClassTargets([{ classId: 'a', targetBps: 5900 }])).rejects.toBeInstanceOf(TargetsMustSum100Error);

        expect(applyClassTargets).not.toHaveBeenCalled();
        expect(targetSave).toHaveBeenCalledWith('classes', 'must_sum_100');
    });

    it('classe desconhecida conta failed', async () => {
        const { application, targetSave } = build();

        await expect(application.saveClassTargets([{ classId: 'zzz', targetBps: 10000 }])).rejects.toBeInstanceOf(ClassNotFoundError);

        expect(targetSave).toHaveBeenCalledWith('classes', 'failed');
    });
});

describe('ClassTargetsApplication.saveAssetTargets', () => {
    it('grava as metas e devolve as atribuições da classe', async () => {
        const { application, applyAssetTargets, targetsSaved } = build();

        const view = await application.saveAssetTargets('a', [
            { subjectType: 'position', subjectId: SUBJECT_A, targetInClassBps: 6000 },
            { subjectType: 'position', subjectId: SUBJECT_B, targetInClassBps: 4000 }
        ]);

        expect(applyAssetTargets).toHaveBeenCalledWith([
            { assignmentId: 'x1', targetInClassBps: 6000 },
            { assignmentId: 'x2', targetInClassBps: 4000 }
        ]);
        expect(view.classId).toBe('a');
        expect(view.targets).toHaveLength(2);
        expect(targetsSaved).toHaveBeenCalledWith('assets', 'a');
    });

    it('classe inexistente dá class_not_found', async () => {
        const { application } = build({ classFound: false });

        await expect(application.saveAssetTargets('zzz', [])).rejects.toBeInstanceOf(ClassNotFoundError);
    });

    it('lista incompleta conta incomplete e não grava', async () => {
        const { application, applyAssetTargets, targetSave } = build();

        await expect(
            application.saveAssetTargets('a', [{ subjectType: 'position', subjectId: SUBJECT_A, targetInClassBps: 10000 }])
        ).rejects.toBeInstanceOf(TargetsIncompleteError);

        expect(applyAssetTargets).not.toHaveBeenCalled();
        expect(targetSave).toHaveBeenCalledWith('assets', 'incomplete');
    });
});

describe('ClassTargetsApplication.reset', () => {
    it('regrava a meta moderada por chave', async () => {
        const { application, applyClassTargets, targetSave } = build();

        await application.reset();

        expect(applyClassTargets).toHaveBeenCalledWith([
            { classId: 'a', targetBps: 2000 },
            { classId: 'b', targetBps: 700 }
        ]);
        expect(targetSave).toHaveBeenCalledWith('reset', 'saved');
    });
});
