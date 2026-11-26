import { Injectable } from '@nestjs/common';
import { AppContext } from '../../context/app-context.port';
import { DatabaseClient } from '../../database/database.client';
import { BareTenantRepository } from '../../database/repositories/bare-tenant.repository';
import { CompanyUsage, FeatureMicros, NewPaidUsageEntry, PeriodFeatureTotal, UsageFeature } from '../usage.types';

const PURGE_BATCH: number = 500;

interface FeatureTotalRow {
    readonly feature: string;
    readonly total: string;
}

@Injectable()
export class PaidUsageEntriesRepository extends BareTenantRepository<'PaidUsageEntries'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'PaidUsageEntries');
    }

    public async insertIfAbsent(entry: Omit<NewPaidUsageEntry, 'companyId'>): Promise<boolean> {
        const inserted: { id: string } | undefined = await this.insertBuilder()
            .values({ ...entry, companyId: this.companyId })
            .onConflict((conflict) => conflict.columns(['companyId', 'feature', 'referenceId']).doNothing())
            .returning('id')
            .executeTakeFirst();
        return inserted !== undefined;
    }

    public async totalsByFeature(period: string): Promise<FeatureMicros> {
        const rows: FeatureTotalRow[] = await this.selectScoped()
            .select(['feature', (eb) => eb.fn.sum<string>('costMicros').as('total')])
            .where('period', '=', period)
            .groupBy('feature')
            .execute();
        const totals: Record<UsageFeature, number> = { ai: 0, whatsapp: 0, help: 0 };
        for (const row of rows) {
            totals[row.feature as UsageFeature] = Number(row.total);
        }
        return totals;
    }

    public async aggregateSince(oldestPeriod: string): Promise<PeriodFeatureTotal[]> {
        const rows: { period: string; feature: string; total: string; entries: string }[] = await this.selectScoped()
            .select([
                'period',
                'feature',
                (eb) => eb.fn.sum<string>('costMicros').as('total'),
                (eb) => eb.fn.countAll<string>().as('entries')
            ])
            .where('period', '>=', oldestPeriod)
            .groupBy(['period', 'feature'])
            .orderBy('period', 'desc')
            .orderBy('feature')
            .execute();
        return rows.map((row): PeriodFeatureTotal => ({
            period: row.period,
            feature: row.feature as UsageFeature,
            costMicros: Number(row.total),
            entries: Number(row.entries)
        }));
    }

    public async companiesWithUsage(period: string): Promise<CompanyUsage[]> {
        const rows: { companyId: string; total: string }[] = await this.selectSkipConstraint()
            .select(['companyId', (eb) => eb.fn.sum<string>('costMicros').as('total')])
            .where('period', '=', period)
            .groupBy('companyId')
            .execute();
        return rows.map((row): CompanyUsage => ({ companyId: row.companyId, usedMicros: Number(row.total) }));
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, PURGE_BATCH);
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        let purged: number = 0;
        let removed: number = await this.hardDeleteBefore('occurredAt', cutoff, PURGE_BATCH);
        while (removed > 0) {
            purged += removed;
            removed = await this.hardDeleteBefore('occurredAt', cutoff, PURGE_BATCH);
        }
        return purged;
    }
}
