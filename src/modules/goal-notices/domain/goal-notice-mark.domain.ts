import { Injectable } from '@nestjs/common';
import { GoalNoticeMarksRepository } from '../repositories/goal-notice-marks.repository';
import { GoalNoticeMark } from './goal-notice.types';

@Injectable()
export class GoalNoticeMarkDomain {
    public constructor(private readonly marks: GoalNoticeMarksRepository) {}

    public async markedGoalIds(month: string): Promise<Set<string>> {
        const marks: GoalNoticeMark[] = await this.marks.listOfMonth(month);
        return new Set(marks.map((mark: GoalNoticeMark): string => mark.goalId));
    }

    public async mark(goalId: string, month: string): Promise<boolean> {
        return this.marks.mark(goalId, month);
    }
}
