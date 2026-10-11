import { Injectable } from '@nestjs/common';
import { SampleDataPort } from '../../onboarding/services/sample-data.port';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { DateUtil } from '../../../shared/utils/date.util';
import { FixedIncomeTitleDomain, TitleDraft } from '../domain/fixed-income-title.domain';
import { sampleTitleDrafts } from '../domain/sample-titles';
import { FixedIncomeTitle, SUGGESTED_CLASS_KEY_BY_INDEXER } from '../domain/fixed-income.types';

const SUBJECT_TYPE: Parameters<ClassAssignmentService['assign']>[0] = 'fixed_income';

@Injectable()
export class FixedIncomeSampleApplication extends SampleDataPort {
    public readonly area: string = 'fixed_income';

    public constructor(
        private readonly titles: FixedIncomeTitleDomain,
        private readonly classResolver: ClassResolverService,
        private readonly assignments: ClassAssignmentService
    ) {
        super();
    }

    public async seed(): Promise<number> {
        const real: FixedIncomeTitle[] = await this.titles.listReal();
        const samples: FixedIncomeTitle[] = await this.titles.listSamples();
        if (real.length > 0 || samples.length > 0) {
            return 0;
        }
        const drafts: TitleDraft[] = sampleTitleDrafts(DateUtil.todayInBrazil());
        for (const draft of drafts) {
            const created: FixedIncomeTitle = await this.titles.createSample(draft);
            const classId: string = (await this.classResolver.resolveBySystemKey(SUGGESTED_CLASS_KEY_BY_INDEXER[draft.indexer])).id;
            await this.assignments.assign(SUBJECT_TYPE, created.id, classId, true);
        }
        return drafts.length;
    }

    public async clear(): Promise<number> {
        const samples: FixedIncomeTitle[] = await this.titles.listSamples();
        for (const sample of samples) {
            await this.assignments.release(SUBJECT_TYPE, sample.id);
        }
        return this.titles.removeSamples();
    }
}
