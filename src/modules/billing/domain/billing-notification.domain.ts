import { Injectable } from '@nestjs/common';
import { BillingNotificationsRepository } from '../repositories/billing-notifications.repository';
import { NotificationKind } from './billing.types';

@Injectable()
export class BillingNotificationDomain {
    public constructor(private readonly notifications: BillingNotificationsRepository) {}

    public async recordOnce(subjectId: string, kind: NotificationKind): Promise<boolean> {
        return this.notifications.recordOnce(subjectId, kind);
    }
}
