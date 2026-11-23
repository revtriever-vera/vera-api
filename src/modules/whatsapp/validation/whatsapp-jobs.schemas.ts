import { z } from 'zod';

export const webhookReceivedSchema = z.object({ eventId: z.string().uuid() });
export const inboundReceivedSchema = z.object({ eventId: z.string().uuid(), wamid: z.string().min(1) });
export const statusReceivedSchema = z.object({
    eventId: z.string().uuid(),
    wamid: z.string().min(1),
    status: z.enum(['sent', 'delivered', 'read', 'failed'])
});
export const sendRequestedSchema = z.object({ messageId: z.string().uuid() });

export const outboundPayloadSchema = z.union([
    z.object({
        template: z.object({
            language: z.enum(['pt_BR', 'en']),
            variables: z.array(z.string()),
            buttonPayloads: z.array(z.string()).optional()
        })
    }),
    z.object({ choices: z.array(z.object({ id: z.string(), title: z.string() })) })
]);
