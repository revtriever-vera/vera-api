import { Injectable, OnModuleInit } from '@nestjs/common';
import { NoticeTypeRegistry } from '../../notices/services/notice-type.registry';
import { WATCH_DIGEST_TEMPLATE, WATCH_NOTICE_TYPES } from '../domain/portfolio-agenda.types';

@Injectable()
export class PortfolioWatchNoticeRegistrar implements OnModuleInit {
    public constructor(private readonly registry: NoticeTypeRegistry) {}

    public onModuleInit(): void {
        for (const type of Object.values(WATCH_NOTICE_TYPES)) {
            this.registry.register({ type, template: WATCH_DIGEST_TEMPLATE });
        }
    }
}
