import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DateUtil } from '../../../shared/utils/date.util';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { RecurringUpcomingService, UpcomingDebit } from '../../recurring/services/recurring-upcoming.service';
import { RecurringNoticePrefDomain } from '../domain/recurring-notice-pref.domain';
import { addDays, dueInstant, nextWeekSlot, WeekSlot } from '../domain/notice-dates';
import { DAYS_IN_WEEK, DUE_HORIZON_DAYS, RecurringNoticePref } from '../domain/recurring-notices.types';
import { DuePayload, dueJobId, RecurringNoticePublisherService, weekJobId } from './recurring-notice-publisher.service';
import { RecurringNoticesLogService } from './recurring-notices-log.service';

@Injectable()
export class RecurringNoticeSchedulerService {
    public constructor(
        private readonly prefs: RecurringNoticePrefDomain,
        private readonly upcoming: RecurringUpcomingService,
        private readonly timezones: CompanyTimezoneService,
        private readonly publisher: RecurringNoticePublisherService,
        private readonly logs: RecurringNoticesLogService,
        private readonly context: AppContext
    ) {}

    public async scheduleCompany(now: Date = new Date()): Promise<void> {
        const timeZone: string = await this.timezones.timezoneOfCompany();
        const slot: WeekSlot = nextWeekSlot(timeZone, now);
        await this.publisher.queueWeek({ companyId: this.companyId(), monday: slot.monday }, slot.at, now);
        const due: number = await this.scheduleDues(timeZone, null, now);
        this.logs.scheduled(true, due);
    }

    public async scheduleSeriesForUser(userId: string, seriesId: string, now: Date = new Date()): Promise<number> {
        const timeZone: string = await this.timezones.timezoneOfCompany();
        return this.scheduleDues(timeZone, { userId, seriesId }, now);
    }

    public async jobIdsOfCompany(now: Date = new Date()): Promise<string[]> {
        const timeZone: string = await this.timezones.timezoneOfCompany();
        const slot: WeekSlot = nextWeekSlot(timeZone, now);
        const weeks: string[] = [slot.monday, addDays(slot.monday, -DAYS_IN_WEEK)].map((monday: string): string =>
            weekJobId(this.companyId(), monday)
        );
        const today: string = DateUtil.localDateIn(timeZone, now);
        const dates: string[] = Array.from({ length: DUE_HORIZON_DAYS + 1 }, (_unused: unknown, offset: number): string =>
            addDays(today, offset)
        );
        const dues: string[] = (await this.prefs.listEnabled()).flatMap((pref: RecurringNoticePref): string[] =>
            dates.map((date: string): string => dueJobId(this.dueOf(pref.userId, pref.seriesId, date)))
        );
        return [...weeks, ...dues];
    }

    private async scheduleDues(timeZone: string, only: { userId: string; seriesId: string } | null, now: Date): Promise<number> {
        const today: string = DateUtil.localDateIn(timeZone, now);
        const bySeries: Map<string, UpcomingDebit[]> = new Map<string, UpcomingDebit[]>();
        for (const debit of await this.upcoming.debitsFrom(today, DUE_HORIZON_DAYS)) {
            bySeries.set(debit.seriesId, [...(bySeries.get(debit.seriesId) ?? []), debit]);
        }
        const payloads: DuePayload[] = [];
        for (const pref of await this.prefsOf(only)) {
            const debits: UpcomingDebit[] = bySeries.get(pref.seriesId) ?? [];
            payloads.push(...debits.map((debit: UpcomingDebit): DuePayload => this.dueOf(pref.userId, pref.seriesId, debit.date)));
        }
        let queued: number = 0;
        for (const payload of payloads) {
            queued += (await this.queueIfAhead(timeZone, payload, now)) ? 1 : 0;
        }
        return queued;
    }

    private async prefsOf(only: { userId: string; seriesId: string } | null): Promise<{ userId: string; seriesId: string }[]> {
        if (only !== null) {
            return (await this.prefs.isEnabled(only.userId, only.seriesId)) ? [only] : [];
        }
        return this.prefs.listEnabled();
    }

    private async queueIfAhead(timeZone: string, payload: DuePayload, now: Date): Promise<boolean> {
        const at: Date = dueInstant(timeZone, payload.date);
        if (at.getTime() <= now.getTime()) {
            return false;
        }
        await this.publisher.queueDue(payload, at, now);
        return true;
    }

    private dueOf(userId: string, seriesId: string, date: string): DuePayload {
        return { companyId: this.companyId(), seriesId, userId, date };
    }

    private companyId(): string {
        return this.context.get().companyId ?? '';
    }
}
