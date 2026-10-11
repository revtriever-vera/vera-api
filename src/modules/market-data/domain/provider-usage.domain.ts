import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { ProviderUsageRepository } from '../repositories/provider-usage.repository';
import { BUDGET_WINDOWS, BudgetLimits, BudgetWindow, USAGE_RETENTION_DAYS, UsageSlot } from './market-data.types';

const MINUTE_MS: number = 60_000;
const DAY_MS: number = 86_400_000;

export interface WindowReading {
    readonly window: BudgetWindow;
    readonly used: number;
    readonly limit: number;
}

export function windowStartOf(window: BudgetWindow, now: Date): Date {
    if (window === BUDGET_WINDOWS.minute) {
        return new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS);
    }
    if (window === BUDGET_WINDOWS.day) {
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

class BudgetRefusedSignal extends Error {}

@Injectable()
export class ProviderUsageDomain {
    public constructor(private readonly usage: ProviderUsageRepository) {}

    public async reserve(provider: string, calls: number, limits: BudgetLimits, now: Date): Promise<WindowReading[] | null> {
        try {
            return await this.reserveAtomically(provider, calls, limits, now);
        } catch (error: unknown) {
            if (error instanceof BudgetRefusedSignal) {
                return null;
            }
            throw error;
        }
    }

    public async pruneOld(now: Date): Promise<number> {
        const cutoff: Date = new Date(now.getTime() - USAGE_RETENTION_DAYS * DAY_MS);
        return this.usage.pruneBefore(cutoff);
    }

    @UsingTransaction()
    private async reserveAtomically(provider: string, calls: number, limits: BudgetLimits, now: Date): Promise<WindowReading[]> {
        const readings: WindowReading[] = [];
        for (const [window, limit] of this.configured(limits)) {
            const slot: UsageSlot = { provider, windowKind: window, windowStart: windowStartOf(window, now) };
            const used: number | null = calls > limit ? null : await this.usage.tryIncrement(slot, calls, limit);
            if (used === null) {
                throw new BudgetRefusedSignal();
            }
            readings.push({ window, used, limit });
        }
        return readings;
    }

    private configured(limits: BudgetLimits): [BudgetWindow, number][] {
        return Object.values(BUDGET_WINDOWS).flatMap((window: BudgetWindow): [BudgetWindow, number][] => {
            const limit: number | undefined = limits[window];
            return limit === undefined ? [] : [[window, limit]];
        });
    }
}
