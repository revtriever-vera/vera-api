import { DEVIATION_STATUSES, DeviationStatus } from './portfolio.types';

export function deviationStatusOf(deviationBps: number, toleranceBps: number): DeviationStatus {
    if (Math.abs(deviationBps) <= toleranceBps) {
        return DEVIATION_STATUSES.within;
    }
    return deviationBps > 0 ? DEVIATION_STATUSES.above : DEVIATION_STATUSES.below;
}
