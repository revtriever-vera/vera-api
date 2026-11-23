import { Module } from '@nestjs/common';
import { NoticesRepositoryModule } from '../repositories/notices-repository.module';
import { NoticePreferenceDomain } from './notice-preference.domain';
import { NoticeSendDomain } from './notice-send.domain';

@Module({
    imports: [NoticesRepositoryModule],
    providers: [NoticePreferenceDomain, NoticeSendDomain],
    exports: [NoticePreferenceDomain, NoticeSendDomain]
})
export class NoticesDomainModule {}
