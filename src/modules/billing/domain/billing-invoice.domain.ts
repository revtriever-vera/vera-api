import { Injectable } from '@nestjs/common';
import { BillingInvoicesRepository } from '../repositories/billing-invoices.repository';
import { BillingEngine } from './billing-engine.types';
import { mergedMirror } from './billing-invoice.rules';
import { BillingInvoice, InvoiceMirror, InvoicePage } from './billing.types';

@Injectable()
export class BillingInvoiceDomain {
    public constructor(private readonly invoices: BillingInvoicesRepository) {}

    public async findById(id: string): Promise<BillingInvoice | null> {
        return this.invoices.findById(id);
    }

    public async findByEngineId(engine: BillingEngine, engineInvoiceId: string): Promise<BillingInvoice | null> {
        return this.invoices.findByEngineId(engine, engineInvoiceId);
    }

    public async existsByEngineIdAcrossTenants(engine: BillingEngine, engineInvoiceId: string): Promise<boolean> {
        return this.invoices.existsByEngineIdAcrossTenants(engine, engineInvoiceId);
    }

    public async mirror(engine: BillingEngine, subscriptionId: string, mirror: InvoiceMirror): Promise<BillingInvoice> {
        const created: BillingInvoice | null = await this.invoices.insertOnce(engine, subscriptionId, mirror);
        if (created !== null) {
            return created;
        }
        const existing: BillingInvoice | null = await this.invoices.findByEngineId(engine, mirror.engineInvoiceId);
        if (existing === null) {
            throw new Error('billing invoice vanished while being mirrored');
        }
        return this.invoices.replaceMirror(existing.id, mergedMirror(existing, mirror));
    }

    public async markChargeFailed(id: string, at: Date): Promise<void> {
        await this.invoices.markChargeFailed(id, at);
    }

    public async listOpen(): Promise<BillingInvoice[]> {
        return this.invoices.listOpen();
    }

    public async pageOfCompany(page: number, pageSize: number): Promise<InvoicePage> {
        return this.invoices.pageOfCompany(page, pageSize);
    }

    public async listOpenAcrossTenants(limit: number): Promise<BillingInvoice[]> {
        return this.invoices.listOpenAcrossTenants(limit);
    }

    public async companiesWithOverdueAcrossTenants(limit: number): Promise<string[]> {
        return this.invoices.companiesWithOverdueAcrossTenants(limit);
    }
}
