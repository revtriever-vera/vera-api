import { AppError } from '../../../shared/errors/app.error';

export class GoalNotFoundError extends AppError {
    public constructor(goalId: string) {
        super({ code: 'goals.goal_not_found', status: 404, detail: 'The goal does not exist.', meta: { goalId } });
    }
}

export class GoalHoldingNotFoundError extends AppError {
    public constructor(holdingKind: string, holdingId: string) {
        super({
            code: 'goals.holding_not_found',
            status: 404,
            detail: 'The linked asset is not in the portfolio of the company.',
            meta: { holdingKind, holdingId }
        });
    }
}

export class GoalHoldingOverallocatedError extends AppError {
    public constructor(holdingKind: string, holdingId: string, freeBps: number) {
        super({
            code: 'goals.holding_overallocated',
            status: 409,
            detail: 'The shares linked to this asset across all goals would pass 100%.',
            meta: { holdingKind, holdingId, freeBps }
        });
    }
}

export class GoalLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'goals.limit_reached',
            status: 422,
            detail: 'The company reached the maximum number of goals.',
            meta: { limit }
        });
    }
}

export class EmergencyReserveExistsError extends AppError {
    public constructor(goalId: string) {
        super({
            code: 'goals.emergency_reserve_exists',
            status: 409,
            detail: 'The holder already has an emergency reserve goal. Edit the existing one instead.',
            meta: { goalId }
        });
    }
}

export class GoalTargetDateInPastError extends AppError {
    public constructor(targetDate: string) {
        super({
            code: 'goals.target_date_in_past',
            status: 422,
            detail: 'The target date must be after today in the time zone of the company.',
            meta: { targetDate }
        });
    }
}
