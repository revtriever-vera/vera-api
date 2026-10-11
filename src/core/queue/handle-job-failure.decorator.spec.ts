import { DelayedError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { HandleJobFailure, JobFailureHost } from './handle-job-failure.decorator';
import { QueueEnvelope, RunningJob } from './queue.types';

function envelope(): QueueEnvelope {
    return { type: 'sample.type', requestId: 'req-1', companyId: null, occurredAt: new Date().toISOString(), trace: {}, payload: {} };
}

function jobWith(attemptsStarted: number, maxAttempts: number): RunningJob {
    return { id: 'job-1', attemptsStarted, maxAttempts, moveToDelayed: async (): Promise<void> => Promise.resolve() };
}

describe('HandleJobFailure', () => {
    it('passes through the result when the handler succeeds', async () => {
        class Handler implements JobFailureHost {
            public handleJobFailure: undefined;

            @HandleJobFailure()
            public async handle(_envelope: QueueEnvelope): Promise<string> {
                return Promise.resolve('done');
            }
        }

        await expect(new Handler().handle(envelope())).resolves.toBe('done');
    });

    it('rethrows without calling handleJobFailure while attempts remain', async () => {
        const handleJobFailure: ReturnType<typeof vi.fn> = vi.fn();
        class Handler implements JobFailureHost {
            public handleJobFailure = handleJobFailure;

            @HandleJobFailure()
            public handle(_envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
                throw new Error('boom');
            }
        }

        await expect(new Handler().handle(envelope(), jobWith(1, 5))).rejects.toThrow('boom');
        expect(handleJobFailure).not.toHaveBeenCalled();
    });

    it('calls handleJobFailure once the job has exhausted its attempts', async () => {
        const handleJobFailure: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => Promise.resolve());
        class Handler implements JobFailureHost {
            public handleJobFailure = handleJobFailure;

            @HandleJobFailure()
            public handle(_envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
                throw new Error('boom');
            }
        }

        await expect(new Handler().handle(envelope(), jobWith(5, 5))).rejects.toThrow('boom');
        expect(handleJobFailure).toHaveBeenCalledOnce();
    });

    it('always rethrows a DelayedError without treating it as a failure', async () => {
        const handleJobFailure: ReturnType<typeof vi.fn> = vi.fn();
        class Handler implements JobFailureHost {
            public handleJobFailure = handleJobFailure;

            @HandleJobFailure()
            public handle(_envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
                throw new DelayedError('waiting for lock');
            }
        }

        await expect(new Handler().handle(envelope(), jobWith(1, 5))).rejects.toBeInstanceOf(DelayedError);
        expect(handleJobFailure).not.toHaveBeenCalled();
    });

    it('throws a clear setup error when the host has no handleJobFailure', async () => {
        class Handler {
            @HandleJobFailure()
            public handle(_envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
                throw new Error('boom');
            }
        }

        await expect(new Handler().handle(envelope(), jobWith(5, 5))).rejects.toThrow(/handleJobFailure/);
    });
});
