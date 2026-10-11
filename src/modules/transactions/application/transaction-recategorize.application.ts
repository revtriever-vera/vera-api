import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CategoryReaderService, SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { CategoryRuleService } from '../../spending-categories/services/category-rule.service';
import { TransactionCategorizerService } from '../../spending-categories/services/transaction-categorizer.service';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { CategoryKindMismatchError, InvalidCorrectionRuleError } from '../domain/transactions.errors';
import { toTransactionView } from '../domain/transaction.mapper';
import {
    CATEGORY_ORIGINS,
    CategorizationOutcome,
    FinancialAccount,
    LABEL_MAX_LENGTH,
    RULE_SCOPES,
    RuleScope,
    Transaction,
    TransactionView
} from '../domain/transactions.types';
import { TransactionsLogService } from '../services/transactions-log.service';
import { TransactionsMetricsService } from '../services/transactions-metrics.service';
import { TransactionsRecategorizationDriver } from '../services/transactions-recategorization.driver';

type CorrectionInput = Parameters<CategoryRuleService['upsertFromCorrection']>[0];
type SavedRule = Awaited<ReturnType<CategoryRuleService['upsertFromCorrection']>>;

export interface RuleSummary {
    readonly id: string;
    readonly matchType: string;
    readonly label: string;
    readonly appliesTo: string;
    readonly categoryId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface RecategorizePayload {
    readonly categoryId: string | null;
    readonly rule?: { readonly scope: RuleScope } | null;
}

export interface RecategorizedView {
    readonly transaction: TransactionView;
    readonly rule: RuleSummary | null;
    readonly recategorized: number;
}

function toRuleSummary(rule: SavedRule): RuleSummary {
    return {
        id: rule.id,
        matchType: rule.matchType,
        label: rule.label,
        appliesTo: rule.appliesTo,
        categoryId: rule.categoryId,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString()
    };
}

@Injectable()
export class TransactionRecategorizeApplication {
    public constructor(
        private readonly transactions: TransactionDomain,
        private readonly accounts: FinancialAccountDomain,
        private readonly categories: CategoryReaderService,
        private readonly rules: CategoryRuleService,
        private readonly categorizer: TransactionCategorizerService,
        private readonly driver: TransactionsRecategorizationDriver,
        private readonly logs: TransactionsLogService,
        private readonly metrics: TransactionsMetricsService
    ) {}

    @UsingTransaction()
    public async recategorize(id: string, payload: RecategorizePayload): Promise<RecategorizedView> {
        const current: Transaction = await this.transactions.require(id);
        const scope: RuleScope | undefined = payload.rule?.scope;
        const ruleInput: CorrectionInput | null =
            scope === undefined || payload.categoryId === null ? null : this.ruleInput(current, scope, payload.categoryId);
        const updated: Transaction = await this.applyCategory(current, payload.categoryId);
        const rule: SavedRule | null = ruleInput === null ? null : await this.rules.upsertFromCorrection(ruleInput);
        const recategorized: number = rule === null ? 0 : await this.driver.recategorize({ kind: 'rule_saved', ruleId: rule.id });
        this.logs.recategorized(id, rule !== null && rule.createdAt.getTime() === rule.updatedAt.getTime(), recategorized);
        this.metrics.recategorized('manual', 1);
        const account: FinancialAccount = await this.accounts.require(updated.accountId);
        return { transaction: toTransactionView(updated, account.name), rule: rule === null ? null : toRuleSummary(rule), recategorized };
    }

    private async applyCategory(current: Transaction, categoryId: string | null): Promise<Transaction> {
        if (categoryId === null) {
            return this.transactions.patch(current.id, this.automatic(await this.categorize(current)));
        }
        const category: SpendingCategory = await this.categories.requireById(categoryId);
        if (category.kind === 'income' && Number(current.amountMinor) < 0) {
            throw new CategoryKindMismatchError(categoryId, current.id);
        }
        return this.transactions.patch(current.id, { categoryId, categorySource: CATEGORY_ORIGINS.user, ruleId: null });
    }

    private async categorize(current: Transaction): Promise<CategorizationOutcome> {
        return this.categorizer.categorize({
            amountMinor: Number(current.amountMinor),
            normalizedDescription: current.normalizedDescription,
            counterpartyKey: current.counterpartyKey,
            providerCategoryId: current.providerCategoryId
        });
    }

    private automatic(outcome: CategorizationOutcome): { categoryId: string | null; categorySource: string; ruleId: string | null } {
        return { categoryId: outcome.categoryId, categorySource: outcome.source, ruleId: outcome.ruleId };
    }

    private ruleInput(current: Transaction, scope: RuleScope, categoryId: string): CorrectionInput {
        const isCounterparty: boolean = scope === RULE_SCOPES.counterparty;
        const pattern: string | null = isCounterparty ? current.counterpartyKey : current.normalizedDescription;
        if (pattern === null) {
            throw new InvalidCorrectionRuleError('counterparty_unavailable');
        }
        if (pattern.length === 0) {
            throw new InvalidCorrectionRuleError('description_empty');
        }
        return {
            matchType: scope,
            pattern,
            label: ((isCounterparty ? current.counterpartyName : null) ?? current.normalizedDescription).slice(0, LABEL_MAX_LENGTH),
            appliesTo: Number(current.amountMinor) < 0 ? 'out' : 'in',
            categoryId,
            isSample: current.isSample
        };
    }
}
