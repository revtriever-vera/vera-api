import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../core/queue/queue.types';
import { QuotesChunkApplication } from '../application/quotes-chunk.application';
import { QuotesSweepApplication } from '../application/quotes-sweep.application';
import { ReferenceDataApplication } from '../application/reference-data.application';
import { PtaxAfternoonCommand, PtaxAfternoonTickHandler } from './commands/ptax-afternoon.command';
import { QuotesSweepCommand, QuotesSweepTickHandler } from './commands/quotes-sweep.command';
import { ReferenceDailyCommand, ReferenceDailyTickHandler } from './commands/reference-daily.command';
import { QuoteOnDemandHandler } from './queue/quote-ondemand.handler';
import { QuotesChunkHandler } from './queue/quotes-chunk.handler';

function envelope(type: string, payload: unknown = {}): QueueEnvelope {
    return { type, requestId: 'req', companyId: null, occurredAt: new Date(0).toISOString(), trace: {}, payload };
}

describe('market-data commands', () => {
    it('schedules the sweep at 22:30, the reference at 09:00 and the PTAX on weekdays at 14:30', () => {
        const sweep: QuotesSweepCommand = new QuotesSweepCommand();
        const reference: ReferenceDailyCommand = new ReferenceDailyCommand();
        const ptax: PtaxAfternoonCommand = new PtaxAfternoonCommand();

        expect([sweep.key, sweep.queue, sweep.type, sweep.pattern]).toEqual([
            'market-data-quotes-sweep-command',
            'vera-market-data',
            'market-data.quotes.sweep.requested',
            '30 22 * * *'
        ]);
        expect([reference.key, reference.type, reference.pattern]).toEqual([
            'market-data-reference-daily-command',
            'market-data.reference.requested',
            '0 9 * * *'
        ]);
        expect([ptax.key, ptax.type, ptax.pattern]).toEqual([
            'market-data-ptax-afternoon-command',
            'market-data.ptax.requested',
            '30 14 * * 1-5'
        ]);
    });

    it('routes each tick to its application', async () => {
        const handleTick: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(0);
        const handleReference: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const handlePtax: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const reference: ReferenceDataApplication = { handleReference, handlePtax } as unknown as ReferenceDataApplication;

        await new QuotesSweepTickHandler({ handleTick } as unknown as QuotesSweepApplication).handle(envelope('x'));
        await new ReferenceDailyTickHandler(reference).handle(envelope('x'));
        await new PtaxAfternoonTickHandler(reference).handle(envelope('x'));

        expect([handleTick, handleReference, handlePtax].map((fn: ReturnType<typeof vi.fn>) => fn.mock.calls.length)).toEqual([1, 1, 1]);
    });

    it('hands chunk and on-demand payloads to the application', async () => {
        const handleChunk: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const handleOnDemand: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const application: QuotesChunkApplication = { handleChunk, handleOnDemand } as unknown as QuotesChunkApplication;
        const chunk: QuotesChunkHandler = new QuotesChunkHandler(application);
        const onDemand: QuoteOnDemandHandler = new QuoteOnDemandHandler(application);

        await chunk.handle(envelope('market-data.quotes.chunk.requested', { provider: 'brapi', assetIds: ['a'] }));
        await onDemand.handle(envelope('market-data.quote.ondemand.requested', { assetId: 'a' }));

        expect(chunk.type).toBe('market-data.quotes.chunk.requested');
        expect(onDemand.queue).toBe('vera-market-data');
        expect(handleChunk).toHaveBeenCalledWith({ provider: 'brapi', assetIds: ['a'] });
        expect(handleOnDemand).toHaveBeenCalledWith({ assetId: 'a' });
    });
});
