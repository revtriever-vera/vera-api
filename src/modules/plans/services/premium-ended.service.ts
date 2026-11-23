import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { PremiumEndedNotificationDomain } from '../domain/premium-ended-notification.domain';
import { MAX_NOTIFICATION_ATTEMPTS, NOTIFICATION_STATUSES, PremiumEndedNotification } from '../domain/plans.types';
import { PlansLogService } from './plans-log.service';
import { PremiumLifecyclePort } from './premium-lifecycle.port';
import { PremiumLifecycleRegistry } from './premium-lifecycle.registry';

const RETRY_DELAY_MS: number = 15 * 60 * 1000;
const SWEEP_BATCH: number = 200;

@Injectable()
export class PremiumEndedService {
    public constructor(
        private readonly registry: PremiumLifecycleRegistry,
        private readonly notifications: PremiumEndedNotificationDomain,
        private readonly publisher: QueuePublisherPort,
        private readonly logs: PlansLogService
    ) {}

    public async notify(contractEndsAt: Date): Promise<void> {
        const handlers: PremiumLifecyclePort[] = this.registry.handlers();
        let failed: number = 0;
        for (const handler of handlers) {
            const notification: PremiumEndedNotification = await this.notifications.record(handler.name, contractEndsAt);
            failed += (await this.run(handler, notification)) ? 0 : 1;
        }
        this.logs.premiumEnded(handlers.length, failed);
    }

    @AsCompany()
    public async retryOne(_companyId: string, notificationId: string): Promise<void> {
        const notification: PremiumEndedNotification | null = await this.notifications.findById(notificationId);
        const handler: PremiumLifecyclePort | null = notification === null ? null : this.registry.handlerNamed(notification.handler);
        if (notification === null || handler === null || notification.status === NOTIFICATION_STATUSES.done) {
            return;
        }
        await this.run(handler, notification);
    }

    public async sweep(): Promise<number> {
        const open: PremiumEndedNotification[] = await this.notifications.listOpenAcrossTenants(SWEEP_BATCH);
        for (const notification of open) {
            await this.retryOne(notification.companyId, notification.id);
        }
        return open.length;
    }

    private async run(handler: PremiumLifecyclePort, notification: PremiumEndedNotification): Promise<boolean> {
        try {
            await handler.onPremiumEnded();
            await this.notifications.markDone(notification.id);
            return true;
        } catch (error: unknown) {
            this.logs.handlerFailed(handler.name, error);
            await this.notifications.markFailed(notification, error);
            await this.scheduleRetry(notification);
            return false;
        }
    }

    private async scheduleRetry(notification: PremiumEndedNotification): Promise<void> {
        const attempts: number = notification.attempts + 1;
        if (attempts >= MAX_NOTIFICATION_ATTEMPTS) {
            return;
        }
        await this.publisher.publish(
            QUEUES.plans,
            MESSAGE_TYPES.plansPremiumEndedRetryRequested,
            { notificationId: notification.id },
            { jobId: `premium-ended-${notification.id}-${String(attempts)}`, delayMs: RETRY_DELAY_MS }
        );
    }
}
