import { Injectable } from '@nestjs/common';
import { CategoryNotFoundError } from '../domain/categories.errors';
import { SpendingCategory } from '../domain/categories.types';
import { SpendingCategoryDomain } from '../domain/spending-category.domain';

export type { SpendingCategory };

@Injectable()
export class CategoryReaderService {
    public constructor(private readonly categories: SpendingCategoryDomain) {}

    public async listForCompany(): Promise<readonly SpendingCategory[]> {
        await this.categories.ensureDefaults();
        return this.categories.listActive();
    }

    public async requireById(id: string): Promise<SpendingCategory> {
        const categories: readonly SpendingCategory[] = await this.listForCompany();
        const found: SpendingCategory | undefined = categories.find((category: SpendingCategory): boolean => category.id === id);
        if (found === undefined) {
            throw new CategoryNotFoundError(id);
        }
        return found;
    }
}
