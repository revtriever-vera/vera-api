import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import {
    CategoryKindMismatchError,
    CategoryNameRequiredError,
    CategoryNotFoundError,
    FlexibilityNotApplicableError,
    SystemCategoryLockedError
} from '../domain/categories.errors';
import {
    CATEGORY_ACTIONS,
    CATEGORY_KINDS,
    CategoryKind,
    CategoryRule,
    CategoryView,
    Flexibility,
    IconKey,
    RULE_ACTIONS,
    SpendingCategory
} from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { toCategoryView, toMatchType } from '../domain/category.mapper';
import { SpendingCategoryDomain } from '../domain/spending-category.domain';
import { CategoryReaderService } from '../services/category-reader.service';
import { RecategorizationRegistry } from '../services/recategorization.registry';
import { SpendingCategoriesLogService } from '../services/spending-categories-log.service';
import { SpendingCategoriesMetricsService } from '../services/spending-categories-metrics.service';

export interface CreateCategoryPayload {
    readonly name: string;
    readonly kind: Extract<CategoryKind, 'expense' | 'income'>;
    readonly flexibility?: Flexibility;
    readonly icon: IconKey;
}

export interface UpdateCategoryPayload {
    readonly name?: string | null;
    readonly flexibility?: Flexibility;
    readonly icon?: IconKey;
}

@Injectable()
export class CategoryApplication {
    public constructor(
        private readonly categories: SpendingCategoryDomain,
        private readonly rules: CategoryRuleDomain,
        private readonly reader: CategoryReaderService,
        private readonly recategorization: RecategorizationRegistry,
        private readonly logs: SpendingCategoriesLogService,
        private readonly metrics: SpendingCategoriesMetricsService
    ) {}

    public async list(): Promise<CategoryView[]> {
        const categories: readonly SpendingCategory[] = await this.reader.listForCompany();
        return categories.map(toCategoryView);
    }

    public async create(payload: CreateCategoryPayload): Promise<CategoryView> {
        const existing: readonly SpendingCategory[] = await this.reader.listForCompany();
        const created: SpendingCategory = await this.categories.create(
            { name: payload.name, kind: payload.kind, flexibility: payload.flexibility ?? null, icon: payload.icon },
            existing
        );
        this.logs.categoryWritten(created.id, CATEGORY_ACTIONS.created, 0);
        return toCategoryView(created);
    }

    public async update(id: string, payload: UpdateCategoryPayload): Promise<CategoryView> {
        const current: SpendingCategory = await this.reader.requireById(id);
        this.assertUpdateAllowed(current, payload);
        const updated: SpendingCategory | null = await this.categories.update(id, payload);
        if (updated === null) {
            throw new CategoryNotFoundError(id);
        }
        this.recordUpdate(current, payload);
        return toCategoryView(updated);
    }

    @UsingTransaction()
    public async remove(id: string, moveToCategoryId: string | undefined): Promise<{ recategorized: number }> {
        const current: SpendingCategory = await this.reader.requireById(id);
        if (current.systemKey !== null) {
            throw new SystemCategoryLockedError(id);
        }
        const destination: SpendingCategory | null = await this.destinationFor(current, moveToCategoryId);
        await this.categories.remove(id);
        const removedRules: CategoryRule[] = await this.rules.removeByCategory(id);
        for (const rule of removedRules) {
            this.metrics.ruleAction(RULE_ACTIONS.removed, toMatchType(rule.matchType));
        }
        const recategorized: number = await this.recategorization.recategorize({
            kind: 'category_removed',
            categoryId: id,
            moveToCategoryId: destination?.id ?? null
        });
        this.logs.categoryWritten(id, CATEGORY_ACTIONS.removed, recategorized);
        return { recategorized };
    }

    private async destinationFor(current: SpendingCategory, moveToCategoryId: string | undefined): Promise<SpendingCategory | null> {
        if (moveToCategoryId === undefined) {
            return null;
        }
        if (moveToCategoryId === current.id) {
            throw new CategoryNotFoundError(moveToCategoryId);
        }
        const destination: SpendingCategory = await this.reader.requireById(moveToCategoryId);
        if (destination.kind !== current.kind) {
            throw new CategoryKindMismatchError(current.id, destination.id);
        }
        return destination;
    }

    private assertUpdateAllowed(current: SpendingCategory, payload: UpdateCategoryPayload): void {
        if (current.systemKey !== null && payload.icon !== undefined) {
            throw new SystemCategoryLockedError(current.id);
        }
        if (payload.name === null && current.systemKey === null) {
            throw new CategoryNameRequiredError();
        }
        if (payload.flexibility !== undefined && current.kind !== CATEGORY_KINDS.expense) {
            throw new FlexibilityNotApplicableError(current.id);
        }
    }

    private recordUpdate(current: SpendingCategory, payload: UpdateCategoryPayload): void {
        if (payload.name !== undefined) {
            this.logs.categoryWritten(current.id, CATEGORY_ACTIONS.renamed, 0);
        }
        if (payload.flexibility !== undefined && payload.flexibility !== current.flexibility) {
            this.logs.categoryWritten(current.id, CATEGORY_ACTIONS.flexibilityChanged, 0);
        }
    }
}
