import { Injectable } from '@nestjs/common';
import { CategoryRuleService } from '../../spending-categories/services/category-rule.service';
import { RecategorizationPort, RecategorizationScope, RuleMatcher } from '../../spending-categories/services/recategorization.port';
import { TransactionCategorizerService } from '../../spending-categories/services/transaction-categorizer.service';
import { RowSelection, TransactionDomain } from '../domain/transaction.domain';
import { CategorizationOutcome, RECATEGORIZATION_CHUNK_SIZE, Transaction } from '../domain/transactions.types';
import { TransactionsLogService } from './transactions-log.service';
import { TransactionsMetricsService } from './transactions-metrics.service';

type CategoryRule = Awaited<ReturnType<CategoryRuleService['listForCompany']>>[number];

interface OutcomeGroup {
    readonly outcome: CategorizationOutcome;
    readonly ids: string[];
}

function unchanged(row: Transaction, outcome: CategorizationOutcome): boolean {
    return row.categoryId === outcome.categoryId && row.categorySource === outcome.source && row.ruleId === outcome.ruleId;
}

function groupOf(groups: Map<string, OutcomeGroup>, outcome: CategorizationOutcome): OutcomeGroup {
    const key: string = `${outcome.categoryId ?? ''}|${outcome.source}|${outcome.ruleId ?? ''}`;
    const known: OutcomeGroup | undefined = groups.get(key);
    if (known !== undefined) {
        return known;
    }
    const created: OutcomeGroup = { outcome, ids: [] };
    groups.set(key, created);
    return created;
}

@Injectable()
export class TransactionsRecategorizationDriver extends RecategorizationPort {
    public constructor(
        private readonly transactions: TransactionDomain,
        private readonly categorizer: TransactionCategorizerService,
        private readonly rules: CategoryRuleService,
        private readonly logs: TransactionsLogService,
        private readonly metrics: TransactionsMetricsService
    ) {
        super();
    }

    public async recategorize(scope: RecategorizationScope): Promise<number> {
        const affected: number = await this.run(scope);
        this.logs.portScope(scope.kind, affected);
        this.metrics.recategorized('rule', affected);
        return affected;
    }

    public async countMatches(matcher: RuleMatcher): Promise<number> {
        return this.transactions.countSelection({ kind: 'matcher', ...matcher }, false);
    }

    private async run(scope: RecategorizationScope): Promise<number> {
        if (scope.kind === 'rule_saved') {
            return this.ruleSaved(scope.ruleId);
        }
        if (scope.kind === 'rule_removed') {
            return this.rerun({ kind: 'rule', ruleId: scope.ruleId }, false);
        }
        return scope.moveToCategoryId === null
            ? this.rerun({ kind: 'category', categoryId: scope.categoryId }, true)
            : this.move({ kind: 'category', categoryId: scope.categoryId }, scope.moveToCategoryId);
    }

    private async ruleSaved(ruleId: string): Promise<number> {
        const rule: CategoryRule | undefined = (await this.rules.listForCompany()).find(
            (candidate: CategoryRule): boolean => candidate.id === ruleId
        );
        if (rule === undefined) {
            return 0;
        }
        return this.rerun({ kind: 'matcher', matchType: rule.matchType, pattern: rule.pattern, appliesTo: rule.appliesTo }, false);
    }

    private async rerun(selection: RowSelection, includeUser: boolean): Promise<number> {
        return this.inBatches(selection, includeUser, async (rows: readonly Transaction[]): Promise<number> =>
            this.recategorizeBatch(rows)
        );
    }

    private async move(selection: RowSelection, categoryId: string): Promise<number> {
        return this.inBatches(selection, true, async (rows: readonly Transaction[]): Promise<number> =>
            this.transactions.moveCategory(
                rows.map((row: Transaction): string => row.id),
                categoryId
            )
        );
    }

    private async inBatches(
        selection: RowSelection,
        includeUser: boolean,
        handler: (rows: readonly Transaction[]) => Promise<number>
    ): Promise<number> {
        let affected: number = 0;
        let batch: Transaction[] = await this.transactions.selectBatch(selection, null, RECATEGORIZATION_CHUNK_SIZE, includeUser);
        while (batch.length > 0) {
            affected += await handler(batch);
            const lastId: string = batch[batch.length - 1]?.id ?? '';
            batch =
                batch.length < RECATEGORIZATION_CHUNK_SIZE
                    ? []
                    : await this.transactions.selectBatch(selection, lastId, RECATEGORIZATION_CHUNK_SIZE, includeUser);
        }
        return affected;
    }

    private async recategorizeBatch(rows: readonly Transaction[]): Promise<number> {
        const outcomes: readonly CategorizationOutcome[] = await this.categorizer.categorizeMany(
            rows.map((row: Transaction) => ({
                amountMinor: Number(row.amountMinor),
                normalizedDescription: row.normalizedDescription,
                counterpartyKey: row.counterpartyKey,
                providerCategoryId: row.providerCategoryId
            }))
        );
        const groups: Map<string, OutcomeGroup> = new Map<string, OutcomeGroup>();
        rows.forEach((row: Transaction, index: number): void => {
            const outcome: CategorizationOutcome | undefined = outcomes[index];
            if (outcome !== undefined && !unchanged(row, outcome)) {
                groupOf(groups, outcome).ids.push(row.id);
            }
        });
        let changed: number = 0;
        for (const group of groups.values()) {
            changed += await this.transactions.applyOutcome(group.ids, group.outcome);
        }
        return changed;
    }
}
