import { z } from 'zod';
import { EVENT_SOURCES } from '../domain/portfolio-events.types';

export const batchPayloadSchema = z.object({
    source: z.nativeEnum(EVENT_SOURCES),
    assetIds: z.array(z.string().uuid()).min(1)
});

export type BatchPayload = z.infer<typeof batchPayloadSchema>;
