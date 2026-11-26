import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { AssetClass, ClassReaderService } from '../../allocation/services/class-reader.service';
import { ClassDisplayNameService } from '../../allocation/services/class-display-name.service';
import {
    MonthlyReviewSummaryService,
    ReviewClassLabel,
    StoredMonthlyReviewSummary
} from '../../ai-assistant/services/monthly-review-summary.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { MonthlyReview } from '../validation/monthly-review.schemas';

const PARAGRAPH_SEPARATOR: string = '\n\n';

@Injectable()
export class MonthlyReviewNarrativeService {
    public constructor(
        private readonly summaries: MonthlyReviewSummaryService,
        private readonly classes: ClassReaderService,
        private readonly names: ClassDisplayNameService,
        private readonly gate: PlanGateService,
        private readonly context: AppContext
    ) {}

    public async paragraphsOf(review: MonthlyReview): Promise<readonly string[] | null> {
        return this.summaries.paragraphsOf({ review, labels: await this.labels() });
    }

    public async storedOf(month: string): Promise<string | null> {
        if ((await this.gate.planOf()) === 'free') {
            return null;
        }
        const stored: StoredMonthlyReviewSummary | null = await this.summaries.storedOf(month);
        return stored === null ? null : stored.paragraphs.join(PARAGRAPH_SEPARATOR);
    }

    public async labels(): Promise<ReviewClassLabel[]> {
        const locale: AppLocale = this.context.get().locale;
        const classes: readonly AssetClass[] = await this.classes.listForCompany();
        return classes.map((item: AssetClass): ReviewClassLabel => ({
            classId: item.id,
            systemKey: item.systemKey,
            displayName: this.names.nameOf(item, locale)
        }));
    }
}
