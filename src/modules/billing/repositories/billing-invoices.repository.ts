import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { Page } from '../../../shared/pagination/pagination.types';
import { IdUtil } from '../../../shared/utils/id.util';
import { BillingEngine } from '../domain/billing-engine.types';
import { BillingInvoice, INVOICE_STATUSES, InvoiceMirror, InvoicePage } from '../domain/billing.types';

const OPEN_STATUSES: readonly string[] = [INVOICE_STATUSES.issued, INVOICE_STATUSES.overdue];

@Injectable()
export class BillingInvoicesRepository extends BareTenantRepository<'BillingInvoices'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'BillingInvoices');
    }

    public async findByEngineId(engine: BillingEngine, engineInvoiceId: string): Promise<BillingInvoice | null> {
        return this.findOne({ engine, engineInvoiceId });
    }

    public async insertOnce(engine: BillingEngine, subscriptionId: string, mirror: InvoiceMirror): Promise<BillingInvoice | null> {
        const row: BillingInvoice | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, subscriptionId, engine, ...mirror })
            .onConflict((conflict) => conflict.doNothing())
            .returningAll()
            .executeTakeFirst();
        return row ?? null;
    }

    public async replaceMirror(id: string, mirror: InvoiceMirror): Promise<BillingInvoice> {
        const row: BillingInvoice | null = await this.updateRow(id, { ...mirror, updatedAt: new Date() });
        if (row === null) {
            throw new Error('billing invoice vanished while being mirrored');
        }
        return row;
    }

    public async markChargeFailed(id: string, at: Date): Promise<void> {
        await this.updateRow(id, { chargeFailedAt: at, updatedAt: new Date() });
    }

    public async listOpen(): Promise<BillingInvoice[]> {
        return this.findMany({ status: [...OPEN_STATUSES] }, { limit: 100, orderBy: [{ property: 'dueDate', direction: 'asc' }] });
    }

    public async pageOfCompany(page: number, pageSize: number): Promise<InvoicePage> {
        const result: Page<BillingInvoice> = await this.findAllPaginated({
            page,
            pageSize,
            orderBy: [{ property: 'dueDate', direction: 'desc' }]
        });
        return { items: result.data, page: result.pagination.page, total: result.pagination.totalRecords };
    }

    public async listOpenAcrossTenants(limit: number): Promise<BillingInvoice[]> {
        return this.selectSkipConstraint()
            .selectAll()
            .where('status', 'in', [...OPEN_STATUSES])
            .orderBy('updatedAt')
            .limit(limit)
            .execute();
    }

    public async companiesWithOverdueAcrossTenants(limit: number): Promise<string[]> {
        const rows: { companyId: string }[] = await this.selectSkipConstraint()
            .select('companyId')
            .distinct()
            .where('status', '=', INVOICE_STATUSES.overdue)
            .limit(limit)
            .execute();
        return rows.map((row: { companyId: string }): string => row.companyId);
    }
}
