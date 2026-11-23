import { Selectable } from 'kysely';
import { GoalNoticeMarks } from '../../../core/database/generated/database.types';

export type GoalNoticeMark = Selectable<GoalNoticeMarks>;

export const GOAL_BEHIND_NOTICE_TYPE: string = 'goal_behind';
export const GOAL_BEHIND_TEMPLATE: string = 'goal-behind';
export const MAX_MARKS_PER_RUN: number = 100;
