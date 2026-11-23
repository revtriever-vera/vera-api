import { DateUtil } from '../../../shared/utils/date.util';

export function withdrawalEndsAt(firstPaidAt: Date | null, withdrawalDays: number): Date | null {
    return firstPaidAt === null ? null : DateUtil.addDays(firstPaidAt, withdrawalDays);
}

export function isWithinWithdrawal(firstPaidAt: Date | null, withdrawalDays: number, now: Date): boolean {
    const endsAt: Date | null = withdrawalEndsAt(firstPaidAt, withdrawalDays);
    return endsAt !== null && now <= endsAt;
}
