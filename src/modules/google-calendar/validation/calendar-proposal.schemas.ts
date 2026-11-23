import { z } from 'zod';
import { MAX_TITLE_CHARS } from '../domain/calendar.types';

export const proposalPayloadSchema = z.object({
    proposalId: z.string().uuid(),
    userId: z.string().uuid(),
    title: z.string().min(1).max(MAX_TITLE_CHARS),
    start: z.string().datetime(),
    end: z.string().datetime(),
    timeZone: z.string().min(1)
});

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;
