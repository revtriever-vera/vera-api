import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { DateUtil } from '../../../shared/utils/date.util';
import { FixedIncomeCompaniesService } from '../../fixed-income/services/fixed-income-companies.service';
import { DigestEntry, NoticeService } from '../../notices/services/notice.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { isIncomeKind, AgendaItem, AgendaWindow, MATURITY_NOTICE_DAYS } from '../domain/portfolio-agenda.types';
import { addDaysTo, watchNoticeEntriesOf } from '../domain/watch-notice-entries';
import { PortfolioAgendaService } from '../services/portfolio-agenda.service';
import { PortfolioIncomeLedgerService } from '../services/portfolio-income-ledger.service';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';

@Injectable()
export class PortfolioWatchDailyApplication {
    public constructor(
        private readonly positions: PositionReaderService,
        private readonly titles: FixedIncomeCompaniesService,
        private readonly agenda: PortfolioAgendaService,
        private readonly ledger: PortfolioIncomeLedgerService,
        private readonly notices: NoticeService,
        private readonly publisher: PortfolioWatchPublisherService,
        private readonly logs: PortfolioWatchLogService
    ) {}

    public async fanOutDaily(now: Date = new Date()): Promise<number> {
        const today: string = DateUtil.todayInBrazil(now);
        const companyIds: Set<string> = new Set([
            ...(await this.positions.companyIdsWithRealPositions()),
            ...(await this.titles.companyIdsWithRealTitles())
        ]);
        for (const companyId of companyIds) {
            await this.publisher.requestDaily(companyId, today);
        }
        this.logs.dailyFanOut(companyIds.size);
        return companyIds.size;
    }

    @AsCompany()
    public async evaluate(companyId: string, now: Date = new Date()): Promise<number> {
        const today: string = DateUtil.todayInBrazil(now);
        const window: AgendaWindow = { from: today, to: addDaysTo(today, MATURITY_NOTICE_DAYS) };
        const items: AgendaItem[] = await this.agenda.build(window, ANY_HOLDER);
        await this.recordIncome(companyId, items, today);
        const entries: DigestEntry[] = watchNoticeEntriesOf(items, today);
        if (entries.length === 0) {
            return 0;
        }
        const outcome: { sent: number; skipped: number } = await this.notices.notifyDigest(companyId, { entries, props: {} });
        this.logs.dailyEvaluated(entries.length, outcome.sent);
        return outcome.sent;
    }

    private async recordIncome(companyId: string, items: readonly AgendaItem[], today: string): Promise<void> {
        for (const item of items) {
            if (isIncomeKind(item.kind) && item.exDate === today && item.assetId !== null && item.amountPerUnit !== null) {
                await this.ledger.recordEvent(companyId, {
                    eventId: item.id,
                    assetId: item.assetId,
                    amountPerUnit: item.amountPerUnit,
                    currency: item.currency,
                    paymentDate: item.paymentDate
                });
            }
        }
    }
}
