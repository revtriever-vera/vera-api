import { Injectable } from '@nestjs/common';
import { ExpressionBuilder, ExpressionWrapper, SqlBool } from 'kysely';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { DB } from '../../../core/database/generated/database.types';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { BillingEngine } from '../domain/billing-engine.types';
import { BillingSubscription, NewSubscriptionDraft, SUBSCRIPTION_STATUSES } from '../domain/billing.types';

export interface ActivationData {
    readonly engineSubscriptionId: string;
    readonly engineCustomerId: string | null;
    readonly chargeDay: number | null;
}

function withoutExpiredStanding(eb: ExpressionBuilder<DB, 'BillingSubscriptions'>): ExpressionWrapper<DB, 'BillingSubscriptions', SqlBool> {
    return eb.not(
        eb.exists(
            eb
                .selectFrom('CompanyBillingStandings')
                .select('CompanyBillingStandings.id')
                .whereRef('CompanyBillingStandings.companyId', '=', 'BillingSubscriptions.companyId')
                .where('CompanyBillingStandings.endsAt', 'is', null)
                .where('CompanyBillingStandings.status', '=', 'expired')
        )
    );
}

@Injectable()
export class BillingSubscriptionsRepository extends BareTenantRepository<'BillingSubscriptions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'BillingSubscriptions');
    }

    public async reserve(draft: NewSubscriptionDraft): Promise<BillingSubscription | null> {
        const row: BillingSubscription | undefined = await this.insertBuilder()
            .values({
                id: IdUtil.newId(),
                companyId: this.companyId,
                engine: draft.engine,
                status: SUBSCRIPTION_STATUSES.pending,
                planId: draft.planId,
                paymentMethod: draft.paymentMethod,
                firstChargeDate: draft.firstChargeDate,
                trialEndsAt: draft.trialEndsAt,
                discountRules: JSON.stringify(draft.discountRules),
                discountCycleOffset: draft.discountCycleOffset
            })
            .onConflict((conflict) => conflict.doNothing())
            .returningAll()
            .executeTakeFirst();
        return row ?? null;
    }

    public async findOpen(engine: BillingEngine): Promise<BillingSubscription | null> {
        return this.findOne({ engine, status: [SUBSCRIPTION_STATUSES.pending, SUBSCRIPTION_STATUSES.active] });
    }

    public async findCurrent(engine: BillingEngine): Promise<BillingSubscription | null> {
        const rows: BillingSubscription[] = await this.findMany(
            { engine, status: [SUBSCRIPTION_STATUSES.pending, SUBSCRIPTION_STATUSES.active, SUBSCRIPTION_STATUSES.canceled] },
            { limit: 1, orderBy: [{ property: 'createdAt', direction: 'desc' }] }
        );
        return rows[0] ?? null;
    }

    public async listOfCompany(): Promise<BillingSubscription[]> {
        return this.findMany({}, { limit: 100, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async activate(id: string, data: ActivationData): Promise<BillingSubscription | null> {
        const rows: BillingSubscription[] = await this.updateManyRows(
            { id, status: SUBSCRIPTION_STATUSES.pending },
            { ...data, status: SUBSCRIPTION_STATUSES.active, updatedAt: new Date() }
        );
        return rows[0] ?? null;
    }

    public async fail(id: string): Promise<boolean> {
        const rows: BillingSubscription[] = await this.updateManyRows(
            { id, status: SUBSCRIPTION_STATUSES.pending },
            { status: SUBSCRIPTION_STATUSES.failed, updatedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async saveCard(id: string, brand: string | null, last4: string): Promise<void> {
        await this.updateRow(id, { cardBrand: brand, cardLast4: last4, updatedAt: new Date() });
    }

    public async cancel(current: BillingSubscription, at: Date, endsNow: boolean): Promise<BillingSubscription | null> {
        const rows: BillingSubscription[] = await this.updateManyRows(
            { id: current.id, status: SUBSCRIPTION_STATUSES.active },
            {
                status: SUBSCRIPTION_STATUSES.canceled,
                cancelRequestedAt: current.cancelRequestedAt ?? at,
                canceledAt: at,
                paidThrough: endsNow ? at : current.paidThrough,
                updatedAt: at
            }
        );
        return rows[0] ?? null;
    }

    public async markCanceledByEngine(current: BillingSubscription, at: Date): Promise<void> {
        await this.updateManyRows(
            { id: current.id, status: [SUBSCRIPTION_STATUSES.active, SUBSCRIPTION_STATUSES.pending] },
            { status: SUBSCRIPTION_STATUSES.canceled, canceledAt: current.canceledAt ?? at, updatedAt: at }
        );
    }

    public async recordPayment(current: BillingSubscription, paidThrough: Date, paidAt: Date): Promise<void> {
        const furthest: Date = current.paidThrough !== null && current.paidThrough > paidThrough ? current.paidThrough : paidThrough;
        await this.updateRow(current.id, { paidThrough: furthest, firstPaidAt: current.firstPaidAt ?? paidAt, updatedAt: new Date() });
    }

    public async carryPaidPeriod(id: string, paidThrough: Date): Promise<void> {
        await this.updateRow(id, { paidThrough, updatedAt: new Date() });
    }

    public async markTrialStarted(id: string, at: Date): Promise<boolean> {
        const rows: BillingSubscription[] = await this.updateManyRows({ id, trialStartedAt: null }, { trialStartedAt: at, updatedAt: at });
        return rows.length > 0;
    }

    public async listUnconfirmedTrialsAcrossTenants(before: Date, limit: number): Promise<BillingSubscription[]> {
        return this.selectSkipConstraint()
            .selectAll()
            .where('status', '=', SUBSCRIPTION_STATUSES.active)
            .where('trialEndsAt', 'is not', null)
            .where('trialStartedAt', 'is', null)
            .where('createdAt', '<', before)
            .orderBy('createdAt')
            .limit(limit)
            .execute();
    }

    public async listEndingTrialsAcrossTenants(now: Date, until: Date, limit: number): Promise<BillingSubscription[]> {
        return this.selectSkipConstraint()
            .selectAll()
            .where('status', '=', SUBSCRIPTION_STATUSES.active)
            .where('trialStartedAt', 'is not', null)
            .where('firstPaidAt', 'is', null)
            .where('trialEndsAt', '>', now)
            .where('trialEndsAt', '<=', until)
            .orderBy('trialEndsAt')
            .limit(limit)
            .execute();
    }

    public async findByEngineSubscriptionIdAcrossTenants(
        engine: BillingEngine,
        engineSubscriptionId: string
    ): Promise<BillingSubscription | null> {
        const row: BillingSubscription | undefined = await this.selectSkipConstraint()
            .selectAll()
            .where('engine', '=', engine)
            .where('engineSubscriptionId', '=', engineSubscriptionId)
            .executeTakeFirst();
        return row ?? null;
    }

    public async listStalePendingAcrossTenants(before: Date, limit: number): Promise<BillingSubscription[]> {
        return this.selectSkipConstraint()
            .selectAll()
            .where('status', '=', SUBSCRIPTION_STATUSES.pending)
            .where('createdAt', '<', before)
            .orderBy('createdAt')
            .limit(limit)
            .execute();
    }

    public async companiesWithEndedCancellationAcrossTenants(now: Date, limit: number): Promise<string[]> {
        // eslint-disable-next-line local/repository-escape -- varredura entre empresas com NOT EXISTS sobre a situação de cobrança: o base só enxerga a própria tabela
        const rows: { companyId: string }[] = await this.database.executor
            .selectFrom('BillingSubscriptions')
            .select('companyId')
            .distinct()
            .where('status', '=', SUBSCRIPTION_STATUSES.canceled)
            .where((eb) =>
                eb.or([
                    eb('paidThrough', '<', now),
                    eb.and([
                        eb('paidThrough', 'is', null),
                        eb('firstPaidAt', 'is', null),
                        eb('trialStartedAt', 'is not', null),
                        eb('trialEndsAt', '<', now)
                    ])
                ])
            )
            .where(withoutExpiredStanding)
            .limit(limit)
            .execute();
        return rows.map((row: { companyId: string }): string => row.companyId);
    }
}
