import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { ClassAssignment, ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassDisplayNameService } from '../../allocation/services/class-display-name.service';
import { AssetClass, ClassReaderService } from '../../allocation/services/class-reader.service';
import { PortfolioSettingsReaderService, PortfolioSettingsView } from '../../allocation/services/portfolio-settings-reader.service';
import { SourceAssignment, SourceClass } from '../domain/portfolio.types';

export interface ClassInputs {
    readonly baseCurrency: string;
    readonly toleranceBps: number;
    readonly classes: readonly SourceClass[];
    readonly assignments: readonly SourceAssignment[];
}

@Injectable()
export class PortfolioClassInputsService {
    public constructor(
        private readonly classes: ClassReaderService,
        private readonly displayNames: ClassDisplayNameService,
        private readonly assignments: ClassAssignmentService,
        private readonly settings: PortfolioSettingsReaderService,
        private readonly context: AppContext
    ) {}

    public async load(): Promise<ClassInputs> {
        const [classes, assignments, settings]: [readonly AssetClass[], readonly ClassAssignment[], PortfolioSettingsView] =
            await Promise.all([this.classes.listForCompany(), this.assignments.listForCompany(), this.settings.get()]);
        return {
            baseCurrency: settings.baseCurrency,
            toleranceBps: settings.toleranceBps,
            classes: classes.map((item: AssetClass): SourceClass => this.classOf(item)),
            assignments: assignments.map((item: ClassAssignment): SourceAssignment => ({
                subjectType: item.subjectType,
                subjectId: item.subjectId,
                classId: item.classId,
                targetInClassBps: item.targetInClassBps
            }))
        };
    }

    private classOf(item: AssetClass): SourceClass {
        return {
            id: item.id,
            systemKey: item.systemKey,
            name: item.name,
            displayName: this.displayNames.nameOf(item, this.context.get().locale),
            colorKey: item.colorKey,
            targetBps: item.targetBps,
            sortOrder: item.sortOrder
        };
    }
}
