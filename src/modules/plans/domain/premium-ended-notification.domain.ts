import { Injectable } from '@nestjs/common';
import { PremiumEndedNotificationsRepository } from '../repositories/premium-ended-notifications.repository';
import { PremiumEndedNotification } from './plans.types';

@Injectable()
export class PremiumEndedNotificationDomain {
    public constructor(private readonly notifications: PremiumEndedNotificationsRepository) {}

    public async record(handler: string, contractEndsAt: Date): Promise<PremiumEndedNotification> {
        return this.notifications.record(handler, contractEndsAt);
    }

    public async markDone(id: string): Promise<void> {
        await this.notifications.markDone(id);
    }

    public async markFailed(notification: PremiumEndedNotification, error: unknown): Promise<void> {
        await this.notifications.markFailed(notification, error instanceof Error ? error.name : 'UnknownError');
    }

    public async findById(id: string): Promise<PremiumEndedNotification | null> {
        return this.notifications.findById(id);
    }

    public async listOpenAcrossTenants(limit: number): Promise<PremiumEndedNotification[]> {
        return this.notifications.listOpenAcrossTenants(limit);
    }
}
