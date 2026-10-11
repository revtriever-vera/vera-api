import { AppError } from '../../../shared/errors/app.error';

export class ClassNotFoundError extends AppError {
    public constructor(classId: string) {
        super({
            code: 'allocation.class_not_found',
            status: 404,
            detail: 'The asset class does not exist.',
            meta: { classId }
        });
    }
}

export class AssignmentNotFoundError extends AppError {
    public constructor(subjectType: string, subjectId: string) {
        super({
            code: 'allocation.assignment_not_found',
            status: 404,
            detail: 'The asset has no class assignment.',
            meta: { subjectType, subjectId }
        });
    }
}

export class ClassNameTakenError extends AppError {
    public constructor() {
        super({
            code: 'allocation.class_name_taken',
            status: 409,
            detail: 'Another class of the company already answers to this name.'
        });
    }
}

export class ClassLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'allocation.class_limit_reached',
            status: 422,
            detail: 'The company reached the maximum number of asset classes.',
            meta: { limit }
        });
    }
}

export class ClassNotEmptyError extends AppError {
    public constructor(classId: string) {
        super({
            code: 'allocation.class_not_empty',
            status: 409,
            detail: 'The class still has assets assigned to it. Merge it into another class instead.',
            meta: { classId }
        });
    }
}

export class CannotMergeIntoSelfError extends AppError {
    public constructor() {
        super({
            code: 'allocation.cannot_merge_into_self',
            status: 422,
            detail: 'A class cannot be merged into itself.'
        });
    }
}

export class ClassNameRequiredError extends AppError {
    public constructor() {
        super({
            code: 'allocation.class_name_required',
            status: 422,
            detail: 'Only default classes can go back to their translated name; a class created by the user always has a name.'
        });
    }
}

export class SystemClassNotDeletableError extends AppError {
    public constructor(classId: string) {
        super({
            code: 'allocation.system_class_not_deletable',
            status: 422,
            detail: 'Default classes cannot be deleted. Merge the class into another one instead.',
            meta: { classId }
        });
    }
}

export class UnknownSystemKeyError extends AppError {
    public constructor(systemKey: string) {
        super({
            code: 'allocation.unknown_system_key',
            status: 422,
            detail: 'No default class answers to this key.',
            meta: { systemKey }
        });
    }
}
