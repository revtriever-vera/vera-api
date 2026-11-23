import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { CompanyBillingStanding, STANDING_STATUSES, StandingReason, StandingStatus } from '../domain/billing.types';

@Injectable()
export class CompanyBillingStandingsRepository extends BareTenantRepository<'CompanyBillingStandings'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CompanyBillingStandings');
    }

    public async current(): Promise<CompanyBillingStanding | null> {
        return this.findOne({ endsAt: null });
    }

    public async replaceCurrent(status: StandingStatus, reason: StandingReason, at: Date): Promise<void> {
        await this.updateManyRows({ endsAt: null }, { endsAt: at, updatedAt: at });
        await this.createRow({ id: IdUtil.newId(), companyId: this.companyId, status, reason, startsAt: at });
    }

    public async countOpenAcrossTenants(status: StandingStatus): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.selectSkipConstraint()
            .select((eb) => eb.fn.countAll().as('total'))
            .where('endsAt', 'is', null)
            .where('status', '=', status)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public statuses(): readonly StandingStatus[] {
        return [STANDING_STATUSES.active, STANDING_STATUSES.trialing, STANDING_STATUSES.pastDue, STANDING_STATUSES.expired];
    }
}
