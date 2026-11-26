import { Injectable } from '@nestjs/common';
import { ReviewLedgerEntry } from './monthly-review.types';
import { PortfolioIncomeLedgerRepository } from '../repositories/portfolio-income-ledger.repository';
import { IncomeLedgerEntry, IncomeLedgerRow } from './portfolio-watch.types';

@Injectable()
export class PortfolioIncomeLedgerDomain {
    public constructor(private readonly ledger: PortfolioIncomeLedgerRepository) {}

    public async record(entry: IncomeLedgerEntry): Promise<boolean> {
        return this.ledger.recordIfAbsent(entry);
    }

    public async paidBetween(from: string, to: string): Promise<ReviewLedgerEntry[]> {
        const rows: IncomeLedgerRow[] = await this.ledger.listPaidBetween(from, to);
        return rows.map((row: IncomeLedgerRow): ReviewLedgerEntry => ({
            assetId: row.assetId,
            amountMinor: Number(row.amountMinor),
            currency: row.currency
        }));
    }

    public async listPage(offset: number, limit: number): Promise<IncomeLedgerRow[]> {
        return this.ledger.listPage(offset, limit);
    }

    public async eraseAll(): Promise<number> {
        return this.ledger.eraseAll();
    }
}
