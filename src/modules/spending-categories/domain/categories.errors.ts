import { AppError } from '../../../shared/errors/app.error';

export class CategoryNotFoundError extends AppError {
    public constructor(categoryId: string) {
        super({
            code: 'categories.category_not_found',
            status: 404,
            detail: 'The category does not exist.',
            meta: { categoryId }
        });
    }
}

export class CategoryNameTakenError extends AppError {
    public constructor() {
        super({
            code: 'categories.name_taken',
            status: 409,
            detail: 'Another category of the company already uses this name.'
        });
    }
}

export class CategoryNameRequiredError extends AppError {
    public constructor() {
        super({
            code: 'categories.name_required',
            status: 422,
            detail: 'Only default categories can go back to their translated name; a category created by the user always has a name.'
        });
    }
}

export class CategoryLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'categories.limit_reached',
            status: 422,
            detail: 'The company reached the maximum number of categories or rules.',
            meta: { limit }
        });
    }
}

export class SystemCategoryLockedError extends AppError {
    public constructor(categoryId: string) {
        super({
            code: 'categories.system_category_locked',
            status: 422,
            detail: 'Default categories cannot be deleted, change kind or change icon.',
            meta: { categoryId }
        });
    }
}

export class FlexibilityNotApplicableError extends AppError {
    public constructor(categoryId: string) {
        super({
            code: 'categories.flexibility_not_applicable',
            status: 422,
            detail: 'Only expense categories are fixed or flexible.',
            meta: { categoryId }
        });
    }
}

export class CategoryKindMismatchError extends AppError {
    public constructor(categoryId: string, moveToCategoryId: string) {
        super({
            code: 'transactions.category_kind_mismatch',
            status: 422,
            detail: 'The destination category has a different kind from the category being removed.',
            meta: { categoryId, moveToCategoryId }
        });
    }
}

export class RuleNotFoundError extends AppError {
    public constructor(ruleId: string) {
        super({
            code: 'categories.rule_not_found',
            status: 404,
            detail: 'The rule does not exist.',
            meta: { ruleId }
        });
    }
}

export class RuleConflictError extends AppError {
    public constructor(ruleId: string) {
        super({
            code: 'categories.rule_conflict',
            status: 409,
            detail: 'A rule with the same match already exists.',
            meta: { ruleId }
        });
    }
}

export class InvalidRuleError extends AppError {
    public constructor(reason: string) {
        super({
            code: 'categories.invalid_rule',
            status: 422,
            detail: 'The pattern is not valid once normalized.',
            meta: { reason }
        });
    }
}
