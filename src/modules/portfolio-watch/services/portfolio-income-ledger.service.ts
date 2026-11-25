import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { DecimalUtil, mulDecimal, toMinor } from '../../../shared/utils/decimal.util';
import { Position, PositionReaderService } from '../../positions/services/position-reader.service';
import { PortfolioIncomeLedgerDomain } from '../domain/portfolio-income-ledger.domain';
import { IncomeEventInput } from '../domain/portfolio-watch.types';
import { PortfolioWatchLogService } from './portfolio-watch-log.service';

@Injectable()
export class PortfolioIncomeLedgerService {
    public constructor(
        private readonly positions: PositionReaderService,
        private readonly ledger: PortfolioIncomeLedgerDomain,
        private readonly logs: PortfolioWatchLogService
    ) {}

    @AsCompany()
    public async recordEvent(_companyId: string, event: IncomeEventInput): Promise<boolean> {
        const quantity: string = await this.quantityOf(event.assetId);
        if (DecimalUtil.of(quantity).lte(0)) {
            return false;
        }
        const recorded: boolean = await this.ledger.record({
            eventId: event.eventId,
            assetId: event.assetId,
            quantityAtExDate: quantity,
            amountMinor: toMinor(mulDecimal(quantity, event.amountPerUnit), event.currency),
            currency: event.currency,
            paymentDate: event.paymentDate
        });
        this.logs.incomeRecorded(recorded);
        return recorded;
    }

    private async quantityOf(assetId: string): Promise<string> {
        const positions: readonly Position[] = await this.positions.listForCompany(ANY_HOLDER);
        return positions
            .filter((position: Position): boolean => position.assetId === assetId && !position.isSample)
            .reduce((total: ReturnType<typeof DecimalUtil.of>, position: Position) => total.add(position.quantity), DecimalUtil.of(0))
            .toFixed();
    }
}
