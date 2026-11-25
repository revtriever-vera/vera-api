import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { FixedIncomeTitleImporterService, TitleIssuerView } from '../../fixed-income/services/fixed-income-title-importer.service';
import { IndexSeriesReaderService } from '../../fixed-income/services/index-series-reader.service';
import { StoredFixedIncome } from '../domain/fixed-income/fixed-income-import.types';
import {
    applicationDatesOf,
    asDuplicate,
    defaultPositionDate,
    paymentEventCodesOf,
    probeOf,
    proposalsOf
} from '../domain/fixed-income/title-proposal';
import { ParsedInvestmentStatement } from '../domain/investment-statement.types';

@Injectable()
export class FixedIncomeProposalService {
    public constructor(
        private readonly series: IndexSeriesReaderService,
        private readonly titles: FixedIncomeTitleImporterService
    ) {}

    public issuerView(issuerId: string | null): TitleIssuerView | null {
        return this.titles.issuerView(issuerId);
    }

    public async propose(statement: ParsedInvestmentStatement, positionDate: string | undefined): Promise<StoredFixedIncome[]> {
        if (statement.fixedIncome.length === 0) {
            return [];
        }
        const proposals: StoredFixedIncome[] = proposalsOf(statement, {
            positionDate: positionDate ?? defaultPositionDate(DateUtil.todayInBrazil()),
            series: await this.series.loadCurveSeries(),
            paymentEventCodes: paymentEventCodesOf(statement),
            applicationDates: applicationDatesOf(statement),
            matchIssuer: this.titles.matchIssuer.bind(this.titles)
        });
        const duplicates: boolean[] = await this.titles.duplicates(proposals.map(probeOf));
        return proposals.map((proposal: StoredFixedIncome, index: number): StoredFixedIncome =>
            duplicates[index] === true ? asDuplicate(proposal) : proposal
        );
    }
}
