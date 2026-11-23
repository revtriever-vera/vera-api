import { Injectable, OnModuleInit } from '@nestjs/common';
import { GOAL_BEHIND_NOTICE_TYPE, GOAL_BEHIND_TEMPLATE } from '../domain/goal-notice.types';
import { NoticeTypeRegistry } from '../../notices/services/notice-type.registry';

@Injectable()
export class GoalBehindNoticeRegistrar implements OnModuleInit {
    public constructor(private readonly registry: NoticeTypeRegistry) {}

    public onModuleInit(): void {
        this.registry.register({ type: GOAL_BEHIND_NOTICE_TYPE, template: GOAL_BEHIND_TEMPLATE });
    }
}
