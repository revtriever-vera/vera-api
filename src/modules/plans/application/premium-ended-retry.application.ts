import { Injectable } from '@nestjs/common';
import { PremiumEndedService } from '../services/premium-ended.service';

@Injectable()
export class PremiumEndedRetryApplication {
    public constructor(private readonly ended: PremiumEndedService) {}

    public async sweep(): Promise<number> {
        return this.ended.sweep();
    }

    public async retry(companyId: string, notificationId: string): Promise<void> {
        await this.ended.retryOne(companyId, notificationId);
    }
}
