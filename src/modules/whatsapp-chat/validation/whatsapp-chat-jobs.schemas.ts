import { z } from 'zod';

export const turnRequestedSchema = z.object({
    wamid: z.string().min(1),
    linkId: z.string().uuid(),
    contextWamid: z.string().min(1).optional()
});

export const turnAnsweredSchema = z.object({
    wamid: z.string().min(1),
    linkId: z.string().uuid(),
    peer: z.string().min(1),
    text: z.string(),
    locale: z.enum(['pt-BR', 'en']),
    portfolio: z.boolean(),
    receivedAt: z.string().min(1),
    proposals: z.array(z.object({ id: z.string().uuid(), summary: z.string() }))
});

export type TurnRequestedPayload = z.infer<typeof turnRequestedSchema>;
export type TurnAnsweredPayload = z.infer<typeof turnAnsweredSchema>;
