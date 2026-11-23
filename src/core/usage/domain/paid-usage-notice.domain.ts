import { Injectable } from '@nestjs/common';
import { PaidUsageNoticesRepository } from '../repositories/paid-usage-notices.repository';
import { NoticeKind } from '../usage.types';

@Injectable()
export class PaidUsageNoticeDomain {
    public constructor(private readonly notices: PaidUsageNoticesRepository) {}

    public async claim(period: string, kind: NoticeKind): Promise<boolean> {
        return this.notices.claim(period, kind);
    }

    public async eraseAll(): Promise<number> {
        return this.notices.eraseAll();
    }
}
