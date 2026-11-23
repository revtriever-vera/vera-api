import { DateUtil } from '../../../shared/utils/date.util';
import { BillingSubscription, SUBSCRIPTION_STATUSES } from './billing.types';

export interface CardTrialDates {
    readonly firstChargeDate: string;
    readonly trialEndsAt: Date;
}

export function cardTrialDatesOf(now: Date, days: number, timeZone: string): CardTrialDates {
    const end: Date = DateUtil.addDays(now, days);
    return { firstChargeDate: DateUtil.localDateIn(timeZone, end), trialEndsAt: DateUtil.startOfDayIn(timeZone, end) };
}

export function resumableUntilOf(subscription: BillingSubscription | null): Date | null {
    if (subscription?.status !== SUBSCRIPTION_STATUSES.canceled) {
        return null;
    }
    if (subscription.paidThrough !== null) {
        return subscription.paidThrough;
    }
    return subscription.firstPaidAt === null && subscription.trialStartedAt !== null ? subscription.trialEndsAt : null;
}
