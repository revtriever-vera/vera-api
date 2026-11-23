import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { RecurringUpcomingService } from '../../recurring/services/recurring-upcoming.service';
import { RecurringNoticePrefDomain } from '../domain/recurring-notice-pref.domain';
import { NoticeSeriesNotFoundError } from '../domain/recurring-notices.errors';
import { RecurringNoticeSchedulerService } from '../services/recurring-notice-scheduler.service';
import { NoticeBeforeListView, NoticeBeforeView } from '../validation/recurring-notices.schemas';

@Injectable()
export class RecurringNoticePrefsApplication {
    public constructor(
        private readonly prefs: RecurringNoticePrefDomain,
        private readonly upcoming: RecurringUpcomingService,
        private readonly scheduler: RecurringNoticeSchedulerService,
        private readonly context: AppContext
    ) {}

    public async list(): Promise<NoticeBeforeListView> {
        return { seriesIds: await this.prefs.enabledSeriesIdsOf(this.userId()) };
    }

    public async set(seriesId: string, enabled: boolean): Promise<NoticeBeforeView> {
        if (enabled && !(await this.upcoming.isConfirmed(seriesId))) {
            throw new NoticeSeriesNotFoundError(seriesId);
        }
        if (!enabled && !(await this.prefs.isEnabled(this.userId(), seriesId))) {
            return { seriesId, enabled };
        }
        await this.prefs.set(this.userId(), seriesId, enabled);
        if (enabled) {
            await this.scheduler.scheduleSeriesForUser(this.userId(), seriesId);
        }
        return { seriesId, enabled };
    }

    private userId(): string {
        return this.context.get().userId ?? '';
    }
}
