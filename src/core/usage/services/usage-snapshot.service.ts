import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AppContext } from '../../context/app-context.port';
import { MissingTenantContextError } from '../../database/database.errors';
import { PaidUsageEntryDomain } from '../domain/paid-usage-entry.domain';
import { usageConfig } from '../config/usage.config';
import { UsageContextHolder } from '../ports/usage-context.holder';
import { periodOf, resetsAtOf } from '../usage-period';
import { usageStateOf } from '../usage-state';
import { FeatureMicros, UsageState } from '../usage.types';

const TOTALS_TTL_MS: number = 30_000;

interface CachedTotals {
    readonly totals: FeatureMicros;
    readonly expiresAt: number;
}

@Injectable()
export class UsageSnapshotService {
    private readonly cache: Map<string, CachedTotals> = new Map<string, CachedTotals>();

    public constructor(
        @Inject(usageConfig.KEY) private readonly config: ConfigType<typeof usageConfig>,
        private readonly entries: PaidUsageEntryDomain,
        private readonly holder: UsageContextHolder,
        private readonly context: AppContext
    ) {}

    public async state(): Promise<UsageState> {
        const timezone: string = await this.holder.timezone();
        const now: Date = new Date();
        const period: string = periodOf(now, timezone);
        return usageStateOf({
            period,
            resetsAt: resetsAtOf(now, timezone),
            capMicros: await this.holder.capMicros(),
            byFeatureMicros: await this.totalsOf(period),
            warningBps: this.config.PAID_USAGE_WARNING_BPS,
            minRoomMicros: this.config.PAID_USAGE_MIN_ROOM_MICROS
        });
    }

    public invalidate(): void {
        const prefix: string = `${this.companyId()}:`;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    private async totalsOf(period: string): Promise<FeatureMicros> {
        const key: string = `${this.companyId()}:${period}`;
        const cached: CachedTotals | undefined = this.cache.get(key);
        if (cached !== undefined && cached.expiresAt > Date.now()) {
            return cached.totals;
        }
        const totals: FeatureMicros = await this.entries.totalsByFeature(period);
        this.cache.set(key, { totals, expiresAt: Date.now() + TOTALS_TTL_MS });
        return totals;
    }

    private companyId(): string {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            throw new MissingTenantContextError('PaidUsageEntries');
        }
        return companyId;
    }
}
