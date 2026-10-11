import { Injectable } from '@nestjs/common';
import { isUniqueViolationError } from '../../../core/database/database.errors';
import { SpendingCategoriesRepository } from '../repositories/spending-categories.repository';
import { CategoryLimitReachedError, CategoryNameTakenError } from './categories.errors';
import { CATEGORY_KINDS, CategoryKind, Flexibility, IconKey, MAX_USER_CATEGORIES, SpendingCategory } from './categories.types';
import { SYSTEM_CATEGORIES } from './system-categories';

export interface CreateCategoryInput {
    readonly name: string;
    readonly kind: CategoryKind;
    readonly flexibility: Flexibility | null;
    readonly icon: IconKey;
}

export interface UpdateCategoryInput {
    readonly name?: string | null;
    readonly flexibility?: Flexibility;
    readonly icon?: IconKey;
}

@Injectable()
export class SpendingCategoryDomain {
    public constructor(private readonly categories: SpendingCategoriesRepository) {}

    public async ensureDefaults(): Promise<SpendingCategory[]> {
        const existing: SpendingCategory[] = await this.categories.listOrdered();
        const seeded: number = existing.filter((category: SpendingCategory): boolean => category.systemKey !== null).length;
        if (seeded >= SYSTEM_CATEGORIES.length) {
            return [];
        }
        return this.categories.insertSeedsIfMissing(SYSTEM_CATEGORIES);
    }

    public async listActive(): Promise<SpendingCategory[]> {
        return this.categories.listOrdered();
    }

    public async create(input: CreateCategoryInput, existing: readonly SpendingCategory[]): Promise<SpendingCategory> {
        if (existing.filter((item: SpendingCategory): boolean => item.systemKey === null).length >= MAX_USER_CATEGORIES) {
            throw new CategoryLimitReachedError(MAX_USER_CATEGORIES);
        }
        const position: number = existing.reduce((highest: number, item: SpendingCategory) => Math.max(highest, item.position), 0) + 1;
        const flexibility: Flexibility | null = input.kind === CATEGORY_KINDS.expense ? input.flexibility : null;
        return this.guardingName(async () => this.categories.create({ ...input, flexibility, position }));
    }

    public async update(id: string, input: UpdateCategoryInput): Promise<SpendingCategory | null> {
        return this.guardingName(async () => this.categories.updateFields(id, input));
    }

    public async remove(id: string): Promise<void> {
        await this.categories.softDelete(id);
    }

    private async guardingName<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error: unknown) {
            if (isUniqueViolationError(error)) {
                throw new CategoryNameTakenError();
            }
            throw error;
        }
    }
}
