import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { DateUtil } from '../../../shared/utils/date.util';
import { CURRENCIES, FixedIncomeValuation } from '../domain/curve/curve.types';
import { PREVIEW_LIMIT_PER_MINUTE, PREVIEW_WINDOW_SECONDS, TitleTerms } from '../domain/fixed-income.types';
import { assertValidTerms } from '../domain/terms-validation';
import { FixedIncomeValuationService } from '../services/fixed-income-valuation.service';
import { PreviewFixedIncomeDto } from '../validation/fixed-income.schemas';

@Injectable()
export class FixedIncomePreviewApplication {
    public constructor(
        private readonly valuation: FixedIncomeValuationService,
        private readonly throttle: ThrottleService,
        private readonly context: AppContext
    ) {}

    public async preview(input: PreviewFixedIncomeDto): Promise<FixedIncomeValuation> {
        await this.throttle.assertAllowed(
            `fixed-income-preview:${this.context.get().companyId ?? 'anonymous'}`,
            PREVIEW_LIMIT_PER_MINUTE,
            PREVIEW_WINDOW_SECONDS
        );
        const terms: TitleTerms = {
            kind: input.kind,
            indexer: input.indexer,
            rateBps: input.rateBps,
            currency: input.currency ?? CURRENCIES.brl,
            appliedMinor: input.appliedMinor,
            appliedAt: input.appliedAt,
            maturityDate: input.maturityDate
        };
        assertValidTerms(terms, DateUtil.todayInBrazil());
        return this.valuation.preview(terms, new Date());
    }
}
