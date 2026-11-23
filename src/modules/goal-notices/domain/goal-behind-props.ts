import { BehindGoal } from '../../goals/services/goals-reader.service';
import { BehindGoalProp } from '../validation/goal-notices.schemas';

export const GOALS_PROP: string = 'goals';
export const GOALS_URL_PROP: string = 'goalsUrl';
const GOALS_PATH: string = '/portfolio/goals';

function propOf(goal: BehindGoal): BehindGoalProp {
    return {
        name: goal.name,
        targetMinor: goal.targetMinor,
        targetDate: goal.targetDate,
        remainingMinor: goal.remainingMinor,
        monthlyMinor: goal.monthlyMinor,
        planMonthlyMinor: goal.planMonthlyMinor,
        overdue: goal.overdue
    };
}

export function goalBehindProps(goals: readonly BehindGoal[], appUrl: string): Record<string, string> {
    return { [GOALS_PROP]: JSON.stringify(goals.map(propOf)), [GOALS_URL_PROP]: `${appUrl}${GOALS_PATH}` };
}
