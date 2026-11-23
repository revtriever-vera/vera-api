import { z } from 'zod';

export const statePayloadSchema = z.object({
    c: z.string().uuid(),
    u: z.string().uuid(),
    n: z.string().uuid(),
    e: z.number().int(),
    h: z.string().max(320).nullable()
});

export type StatePayloadWire = z.infer<typeof statePayloadSchema>;
