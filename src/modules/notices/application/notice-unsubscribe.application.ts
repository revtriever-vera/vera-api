import { Injectable } from '@nestjs/common';
import { NoticeUnsubscribeService } from '../services/notice-unsubscribe.service';
import { UnsubscribeLinkService, UnsubscribeSubject } from '../services/unsubscribe-link.service';
import { UnsubscribeResult } from '../validation/notices.schemas';

@Injectable()
export class NoticeUnsubscribeApplication {
    public constructor(
        private readonly links: UnsubscribeLinkService,
        private readonly unsubscribing: NoticeUnsubscribeService
    ) {}

    public async unsubscribe(token: string): Promise<UnsubscribeResult> {
        const subject: UnsubscribeSubject = this.links.verify(token);
        await this.unsubscribing.unsubscribe(subject.companyId, subject);
        return { type: subject.type };
    }

    public confirmationPageOf(token: string): string {
        this.links.verify(token);
        return this.links.pageUrlOf(token);
    }
}
