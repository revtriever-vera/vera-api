import { DelayedError } from 'bullmq';
import { QueueEnvelope, RunningJob } from './queue.types';

export interface JobFailureHost {
    handleJobFailure?(envelope: QueueEnvelope, error: unknown): Promise<void>;
}

function exhausted(job: RunningJob | undefined): boolean {
    return job !== undefined && job.attemptsStarted >= job.maxAttempts;
}

export function HandleJobFailure() {
    return function (target: object, key: string, descriptor: PropertyDescriptor): PropertyDescriptor {
        const original: (...args: unknown[]) => Promise<unknown> = descriptor.value as (...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (
            this: JobFailureHost,
            envelope: QueueEnvelope,
            job?: RunningJob,
            ...rest: unknown[]
        ): Promise<unknown> {
            try {
                return await original.apply(this, [envelope, job, ...rest]);
            } catch (error: unknown) {
                return catchJobFailure(this, target, envelope, job, error);
            }
        };
        return descriptor;
    };
}

function catchJobFailure(
    host: JobFailureHost,
    target: object,
    envelope: QueueEnvelope,
    job: RunningJob | undefined,
    error: unknown
): Promise<unknown> {
    if (error instanceof DelayedError) {
        return Promise.reject(error);
    }
    if (!host.handleJobFailure) {
        return Promise.reject(new Error(`@HandleJobFailure exige 'handleJobFailure' em ${target.constructor.name}`));
    }
    return reportIfExhausted(host, envelope, job, error);
}

async function reportIfExhausted(
    host: JobFailureHost,
    envelope: QueueEnvelope,
    job: RunningJob | undefined,
    error: unknown
): Promise<unknown> {
    if (exhausted(job) && host.handleJobFailure) {
        await host.handleJobFailure(envelope, error);
    }
    throw error;
}
