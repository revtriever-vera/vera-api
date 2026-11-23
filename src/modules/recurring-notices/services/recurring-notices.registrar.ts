import { Injectable, OnModuleInit } from '@nestjs/common';
import { NoticeTypeRegistry } from '../../notices/services/notice-type.registry';
import { NOTICE_TEMPLATES, NOTICE_TYPES } from '../domain/recurring-notices.types';

@Injectable()
export class RecurringNoticesRegistrar implements OnModuleInit {
    public constructor(private readonly registry: NoticeTypeRegistry) {}

    public onModuleInit(): void {
        this.registry.register({ type: NOTICE_TYPES.week, template: NOTICE_TEMPLATES.week });
        this.registry.register({ type: NOTICE_TYPES.due, template: NOTICE_TEMPLATES.due });
    }
}
