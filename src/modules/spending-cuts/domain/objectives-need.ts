import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { BPS_BASE, CutsObjectives, MAX_GOAL_BPS } from './spending-cuts.types';

export function objectivesOf(monthlyNeededMinor: number, behindCount: number, incomeMinor: number): CutsObjectives {
    const asGoalBps: number | null =
        incomeMinor > 0
            ? Math.min(MAX_GOAL_BPS, DecimalUtil.of(monthlyNeededMinor).mul(BPS_BASE).div(incomeMinor).ceil().toNumber())
            : null;
    return { monthlyNeededMinor, behindCount, asGoalBps };
}
