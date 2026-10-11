import { AppLocale } from '../../shared/i18n/locale';
import { QueueName } from '../../shared/constants/queues.constants';

export interface QueueEnvelope<TPayload = unknown> {
    readonly type: string;
    readonly requestId: string;
    readonly companyId: string | null;
    readonly locale?: AppLocale;
    readonly occurredAt: string;
    readonly trace: Readonly<Record<string, string>>;
    readonly payload: TPayload;
}

export type ScheduledEnvelope<TPayload = unknown> = Pick<QueueEnvelope<TPayload>, 'type' | 'companyId' | 'payload'>;

export interface PublishOptions {
    readonly jobId?: string;
    readonly delayMs?: number;
    readonly attempts?: number;
    readonly backoffDelayMs?: number;
    readonly replaceExisting?: boolean;
    readonly retryFailed?: boolean;
}

export abstract class QueuePublisherPort {
    public abstract publish(queue: QueueName, type: string, payload: unknown, options?: PublishOptions): Promise<void>;
}

export interface RunningJob {
    readonly id: string;
    readonly attemptsStarted: number;
    readonly maxAttempts: number;
    moveToDelayed(timestamp: number): Promise<void>;
}

export interface QueueWorkerOptions {
    readonly concurrency?: number;
    readonly limiter?: { readonly max: number; readonly duration: number };
}

export abstract class QueueHandlerPort<TPayload = unknown> {
    public readonly workerOptions?: QueueWorkerOptions;
    public abstract readonly queue: QueueName;
    public abstract readonly type: string;
    public abstract handle(envelope: QueueEnvelope<TPayload>, job?: RunningJob): Promise<void>;
}
