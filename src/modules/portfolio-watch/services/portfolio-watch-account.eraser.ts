import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { PortfolioIncomeLedgerDomain } from '../domain/portfolio-income-ledger.domain';
import { PortfolioMonthlySnapshotDomain } from '../domain/portfolio-monthly-snapshot.domain';

export const PORTFOLIO_WATCH_ERASE_AREA: string = 'portfolio-watch';

@Injectable()
export class PortfolioWatchAccountEraser extends AccountDataEraserPort {
    public readonly area: string = PORTFOLIO_WATCH_ERASE_AREA;

    public constructor(
        private readonly snapshots: PortfolioMonthlySnapshotDomain,
        private readonly ledger: PortfolioIncomeLedgerDomain
    ) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return (await this.snapshots.eraseAll()) + (await this.ledger.eraseAll());
    }
}
