import { Injectable } from '@nestjs/common';
import { PortfolioIncomeLedgerRepository } from '../repositories/portfolio-income-ledger.repository';
import { IncomeLedgerEntry, IncomeLedgerRow } from './portfolio-watch.types';

@Injectable()
export class PortfolioIncomeLedgerDomain {
    public constructor(private readonly ledger: PortfolioIncomeLedgerRepository) {}

    public async record(entry: IncomeLedgerEntry): Promise<boolean> {
        return this.ledger.recordIfAbsent(entry);
    }

    public async listPage(offset: number, limit: number): Promise<IncomeLedgerRow[]> {
        return this.ledger.listPage(offset, limit);
    }

    public async eraseAll(): Promise<number> {
        return this.ledger.eraseAll();
    }
}
