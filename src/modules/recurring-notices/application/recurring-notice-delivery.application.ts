import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { NoticeService } from '../../notices/services/notice.service';
import { RecentAlert, RecurringUpcomingService, UpcomingDebit } from '../../recurring/services/recurring-upcoming.service';
import { addDays } from '../domain/notice-dates';
import { duePropsOf, weekPropsOf, DueProps, WeekAlert, WeekEntry } from '../domain/notice-props';
import { RecurringNoticePrefDomain } from '../domain/recurring-notice-pref.domain';
import { ALERT_LOOKBACK_DAYS, NOTICE_TYPES, WEEK_SPAN_DAYS } from '../domain/recurring-notices.types';
import { RecurringNoticePublisherService } from '../services/recurring-notice-publisher.service';
import { RecurringNoticeSchedulerService } from '../services/recurring-notice-scheduler.service';
import { RecurringNoticesLogService } from '../services/recurring-notices-log.service';
import { recurringNoticesConfig } from '../config/recurring-notices.config';

type NoticeOutcome = Awaited<ReturnType<NoticeService['notify']>>;
type NoticeRequest = Parameters<NoticeService['notify']>[1];

function entryOf(debit: UpcomingDebit): WeekEntry {
    return {
        date: debit.date,
        name: debit.name,
        amountMinor: debit.amountMinor,
        estimate: debit.isEstimate,
        card: debit.onCreditCard,
        account: debit.accountName
    };
}

function dueOf(debit: UpcomingDebit): DueProps {
    return {
        name: debit.name,
        amountMinor: debit.amountMinor,
        estimate: debit.isEstimate,
        card: debit.onCreditCard,
        account: debit.accountName,
        lastDate: debit.lastDate
    };
}

function alertOf(alert: RecentAlert): WeekAlert {
    return { kind: alert.kind, name: alert.seriesName, values: alert.data };
}

@Injectable()
export class RecurringNoticeDeliveryApplication {
    public constructor(
        private readonly upcoming: RecurringUpcomingService,
        private readonly prefs: RecurringNoticePrefDomain,
        private readonly scheduler: RecurringNoticeSchedulerService,
        private readonly notices: NoticeService,
        private readonly timezones: CompanyTimezoneService,
        private readonly publisher: RecurringNoticePublisherService,
        private readonly logs: RecurringNoticesLogService,
        @Inject(recurringNoticesConfig.KEY) private readonly config: ConfigType<typeof recurringNoticesConfig>
    ) {}

    public async fanOutDaily(now: Date = new Date()): Promise<number> {
        const companyIds: string[] = await this.upcoming.companyIdsWithConfirmedAcrossTenants();
        const day: string = DateUtil.onlyDateString(now);
        for (const companyId of companyIds) {
            await this.publisher.requestSchedule(companyId, day);
        }
        this.logs.dailyFanout(companyIds.length);
        return companyIds.length;
    }

    @AsCompany()
    public async scheduleCompany(_companyId: string): Promise<void> {
        await this.scheduler.scheduleCompany();
    }

    @AsCompany()
    public async sendWeek(companyId: string, monday: string): Promise<void> {
        const today: string = await this.timezones.todayInCompany();
        const debits: UpcomingDebit[] = today === monday ? await this.upcoming.debitsFrom(today, WEEK_SPAN_DAYS) : [];
        if (debits.length === 0) {
            this.logs.skipped(NOTICE_TYPES.week, today === monday ? 'no_debits' : 'stale');
            return;
        }
        const alerts: RecentAlert[] = await this.upcoming.recentAlerts(today, ALERT_LOOKBACK_DAYS);
        const props: Record<string, string> = weekPropsOf(debits.map(entryOf), alerts.map(alertOf));
        await this.deliver(companyId, { type: NOTICE_TYPES.week, key: `week-${monday}`, props });
    }

    @AsCompany()
    public async sendDue(companyId: string, seriesId: string, userId: string, date: string): Promise<void> {
        const debit: UpcomingDebit | null = await this.dueDebit(seriesId, userId, date);
        if (debit === null) {
            this.logs.skipped(NOTICE_TYPES.due, 'not_applicable');
            return;
        }
        await this.deliver(companyId, { type: NOTICE_TYPES.due, key: `${seriesId}-${date}`, userId, props: duePropsOf(dueOf(debit)) });
    }

    private async dueDebit(seriesId: string, userId: string, date: string): Promise<UpcomingDebit | null> {
        const today: string = await this.timezones.todayInCompany();
        if (addDays(today, 1) !== date || !(await this.prefs.isEnabled(userId, seriesId))) {
            return null;
        }
        return this.upcoming.debitOfSeriesOn(seriesId, date);
    }

    private async deliver(companyId: string, request: NoticeRequest): Promise<void> {
        const outcome: NoticeOutcome = await this.notices.notify(companyId, {
            ...request,
            props: { ...request.props, appUrl: this.config.APP_URL }
        });
        this.logs.delivered(request.type, outcome.sent, outcome.skipped);
    }
}
