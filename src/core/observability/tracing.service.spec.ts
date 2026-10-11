import { describe, expect, it } from 'vitest';
import { TracingService } from './tracing.service';

describe('TracingService', () => {
    it('has no active trace outside of a span', () => {
        const tracing: TracingService = new TracingService();

        expect(tracing.currentTraceId()).toBeNull();
    });

    it('withSpan runs the callback and returns its result', async () => {
        const tracing: TracingService = new TracingService();

        const result: string = await tracing.withSpan('sample.op', { key: 'value' }, async () => Promise.resolve('done'));

        expect(result).toBe('done');
    });

    it('withSpan rethrows and still ends the span when the callback fails', async () => {
        const tracing: TracingService = new TracingService();

        await expect(tracing.withSpan('sample.op', {}, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    });

    it('inject produces a carrier object usable by continueFrom', async () => {
        const tracing: TracingService = new TracingService();
        const carrier: Record<string, string> = tracing.inject();

        const result: string = await tracing.continueFrom(carrier, 'sample.continued', {}, async () => Promise.resolve('resumed'));

        expect(result).toBe('resumed');
    });

    it('continueFrom rethrows when the callback fails', async () => {
        const tracing: TracingService = new TracingService();

        await expect(tracing.continueFrom({}, 'sample.continued', {}, async () => Promise.reject(new Error('boom')))).rejects.toThrow(
            'boom'
        );
    });

    it('annotate does not throw when there is no active span', () => {
        const tracing: TracingService = new TracingService();

        expect(() => {
            tracing.annotate({ key: 'value' });
        }).not.toThrow();
    });
});
