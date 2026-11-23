import { Injectable } from '@nestjs/common';
import { CategoryReaderService, SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { CategoryRuleService } from '../../spending-categories/services/category-rule.service';
import { MerchantDictionaryService } from '../../spending-categories/services/merchant-dictionary.service';
import { RecategorizationRegistry } from '../../spending-categories/services/recategorization.registry';
import { RecurrenceTransaction, TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { RecurringCategoryKindError } from '../domain/recurring.errors';
import { mostFrequent } from '../domain/recurring-math';
import { RecurringSeriesRecord } from '../domain/recurring-series.types';
import { RecurringLogService } from './recurring-log.service';

type CorrectionInput = Parameters<CategoryRuleService['upsertFromCorrection']>[0];

const OTHER_EXPENSES: string = 'other_expenses';
const USER_ORIGINS: ReadonlySet<string> = new Set<string>(['user', 'rule']);

export interface CategoryRuleOutcome {
    readonly created: boolean;
    readonly recategorized: number;
}

const NO_RULE: CategoryRuleOutcome = { created: false, recategorized: 0 };

@Injectable()
export class RecurringCategoryService {
    public constructor(
        private readonly reader: TransactionReaderService,
        private readonly categories: CategoryReaderService,
        private readonly rules: CategoryRuleService,
        private readonly dictionary: MerchantDictionaryService,
        private readonly registry: RecategorizationRegistry,
        private readonly logs: RecurringLogService
    ) {}

    public async alwaysTo(series: RecurringSeriesRecord, chargeIds: readonly string[], categoryId: string): Promise<CategoryRuleOutcome> {
        const category: SpendingCategory = await this.categories.requireById(categoryId);
        if (category.kind !== 'expense') {
            throw new RecurringCategoryKindError(categoryId);
        }
        const charges: RecurrenceTransaction[] = await this.reader.findForRecurrence(chargeIds);
        if (!(await this.isProposable(charges))) {
            this.logs.categoryRule(series.id, 'kept_user_category', 0);
            return NO_RULE;
        }
        const rule: Awaited<ReturnType<CategoryRuleService['upsertFromCorrection']>> = await this.rules.upsertFromCorrection(
            this.ruleInput(series, charges, categoryId)
        );
        const recategorized: number = await this.registry.recategorize({ kind: 'rule_saved', ruleId: rule.id });
        this.logs.categoryRule(series.id, 'rule_saved', recategorized);
        return { created: true, recategorized };
    }

    private async isProposable(charges: readonly RecurrenceTransaction[]): Promise<boolean> {
        const categories: readonly SpendingCategory[] = await this.categories.listForCompany();
        const otherIds: Set<string> = new Set<string>(
            categories
                .filter((category: SpendingCategory): boolean => category.systemKey === OTHER_EXPENSES)
                .map((category: SpendingCategory): string => category.id)
        );
        return charges.every(
            (charge: RecurrenceTransaction): boolean =>
                !USER_ORIGINS.has(charge.categorySource) && (charge.categoryId === null || otherIds.has(charge.categoryId))
        );
    }

    private ruleInput(series: RecurringSeriesRecord, charges: readonly RecurrenceTransaction[], categoryId: string): CorrectionInput {
        const base: Pick<CorrectionInput, 'label' | 'appliesTo' | 'categoryId'> = {
            label: series.name,
            appliesTo: 'out',
            categoryId
        };
        const viaDictionary: boolean = charges.some(
            (charge: RecurrenceTransaction): boolean =>
                this.dictionary.resolve(charge.normalizedDescription, charge.amountMinor)?.pattern === series.merchantKey
        );
        if (viaDictionary) {
            return { ...base, matchType: 'contains', pattern: series.merchantKey };
        }
        if (charges.some((charge: RecurrenceTransaction): boolean => charge.counterpartyKey === series.merchantKey)) {
            return { ...base, matchType: 'counterparty', pattern: series.merchantKey };
        }
        const description: string | null = mostFrequent(
            charges.map((charge: RecurrenceTransaction): string => charge.normalizedDescription)
        );
        return { ...base, matchType: 'description', pattern: description ?? series.merchantKey };
    }
}
