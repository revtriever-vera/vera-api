import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { BehindGoal, BehindGoalsDue, GoalsReaderService } from '../../goals/services/goals-reader.service';
import { NoticeService } from '../../notices/services/notice.service';
import { goalNoticesConfig } from '../config/goal-notices.config';
import { goalBehindProps } from '../domain/goal-behind-props';
import { GoalNoticeMarkDomain } from '../domain/goal-notice-mark.domain';
import { GOAL_BEHIND_NOTICE_TYPE } from '../domain/goal-notice.types';
import { GoalNoticesLogService } from '../services/goal-notices-log.service';
import { GoalNoticesPublisherService } from '../services/goal-notices-publisher.service';

@Injectable()
export class GoalNoticesApplication {
    public constructor(
        private readonly goals: GoalsReaderService,
        private readonly notices: NoticeService,
        private readonly marks: GoalNoticeMarkDomain,
        private readonly publisher: GoalNoticesPublisherService,
        private readonly logs: GoalNoticesLogService,
        @Inject(goalNoticesConfig.KEY) private readonly config: ConfigType<typeof goalNoticesConfig>
    ) {}

    public async fanOutDaily(now: Date = new Date()): Promise<number> {
        const today: string = DateUtil.todayInBrazil(now);
        const companyIds: string[] = await this.goals.companyIdsDue(today);
        for (const companyId of companyIds) {
            await this.publisher.request(companyId, today);
        }
        this.logs.fanOut(companyIds.length);
        return companyIds.length;
    }

    @AsCompany()
    public async evaluate(companyId: string): Promise<number> {
        const due: BehindGoalsDue = await this.goals.behindDue();
        const month: string = due.today.slice(0, 7);
        const marked: Set<string> = await this.marks.markedGoalIds(month);
        const pending: BehindGoal[] = due.goals.filter((goal: BehindGoal): boolean => !marked.has(goal.id));
        if (pending.length === 0) {
            return 0;
        }
        await this.notices.notify(companyId, {
            type: GOAL_BEHIND_NOTICE_TYPE,
            key: due.today,
            props: goalBehindProps(pending, this.config.APP_URL)
        });
        for (const goal of pending) {
            await this.marks.mark(goal.id, month);
        }
        this.logs.evaluated(due.goals.length, pending.length);
        return pending.length;
    }
}
