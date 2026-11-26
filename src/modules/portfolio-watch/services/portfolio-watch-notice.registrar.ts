import { Injectable, OnModuleInit } from '@nestjs/common';
import { NoticeTypeRegistry } from '../../notices/services/notice-type.registry';
import { WATCH_DIGEST_TEMPLATE, WATCH_NOTICE_TYPES } from '../domain/portfolio-agenda.types';
import { WEEKLY_CHANGES_NOTICE_TYPE, WEEKLY_CHANGES_TEMPLATE } from '../domain/weekly-changes';

@Injectable()
export class PortfolioWatchNoticeRegistrar implements OnModuleInit {
    public constructor(private readonly registry: NoticeTypeRegistry) {}

    public onModuleInit(): void {
        for (const type of Object.values(WATCH_NOTICE_TYPES)) {
            this.registry.register({ type, template: WATCH_DIGEST_TEMPLATE });
        }
        this.registry.register({ type: WEEKLY_CHANGES_NOTICE_TYPE, template: WEEKLY_CHANGES_TEMPLATE });
    }
}
