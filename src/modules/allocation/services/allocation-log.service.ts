import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { BaseCurrency, ClassAction, SubjectType, TargetScope } from '../domain/allocation.types';

const CLASSES: string = 'allocation-classes';
const ASSIGNMENT: string = 'allocation-assignment';
const TARGETS: string = 'allocation-targets';
const SETTINGS: string = 'allocation-settings';

@Injectable()
export class AllocationLogService {
    public constructor(private readonly logService: LogService) {}

    public classChanged(action: ClassAction, classId: string): void {
        this.logService.info({ message: 'asset class changed', identifier: CLASSES, meta: { action, classId } });
    }

    public defaultsSeeded(count: number): void {
        this.logService.info({ message: 'default asset classes seeded', identifier: CLASSES, meta: { action: 'seeded', count } });
    }

    public assignmentChanged(subjectType: SubjectType, subjectId: string, classId: string): void {
        this.logService.info({
            message: 'asset class assignment changed',
            identifier: ASSIGNMENT,
            meta: { subjectType, subjectId, classId }
        });
    }

    public assignmentReleased(subjectType: SubjectType, subjectId: string): void {
        this.logService.info({ message: 'asset class assignment released', identifier: ASSIGNMENT, meta: { subjectType, subjectId } });
    }

    public targetsSaved(scope: TargetScope, classId: string | null): void {
        this.logService.info({ message: 'allocation targets saved', identifier: TARGETS, meta: { scope, classId } });
    }

    public settingsChanged(baseCurrency: BaseCurrency, toleranceBps: number): void {
        this.logService.info({ message: 'portfolio settings changed', identifier: SETTINGS, meta: { baseCurrency, toleranceBps } });
    }
}
