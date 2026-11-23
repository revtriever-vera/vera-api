import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const messageSchema = z.object({
    from: z.string().min(1),
    id: z.string().min(1),
    timestamp: z.string().regex(/^\d+$/),
    type: z.string().min(1),
    text: z.object({ body: z.string() }).optional(),
    button: z.object({ payload: z.string().optional(), text: z.string().optional() }).optional(),
    interactive: z
        .object({
            button_reply: z.object({ id: z.string() }).optional(),
            list_reply: z.object({ id: z.string() }).optional()
        })
        .optional(),
    context: z.object({ id: z.string().optional() }).optional()
});

const statusSchema = z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    timestamp: z.string().regex(/^\d+$/),
    pricing: z.object({ billable: z.boolean().optional(), category: z.string().optional() }).optional(),
    errors: z.array(z.object({ code: z.number().optional() })).optional()
});

const valueSchema = z.object({
    metadata: z.object({ phone_number_id: z.string().min(1) }),
    messages: z.array(messageSchema).optional(),
    statuses: z.array(statusSchema).optional()
});

export const webhookBodySchema = z.object({
    object: z.string(),
    entry: z.array(z.object({ changes: z.array(z.object({ field: z.string().optional(), value: valueSchema })) }))
});

export type WebhookBody = z.infer<typeof webhookBodySchema>;
export type WebhookMessage = z.infer<typeof messageSchema>;
export type WebhookStatus = z.infer<typeof statusSchema>;

export const channelProbeSchema = z.object({
    entry: z.array(z.object({ changes: z.array(z.object({ value: z.object({ metadata: z.object({ phone_number_id: z.string() }) }) })) }))
});

export const verificationQuerySchema = z.object({
    'hub.mode': z.string().optional().describe('Meta sends subscribe in the verification handshake'),
    'hub.verify_token': z.string().optional().describe('Token the account configured in the Meta app'),
    'hub.challenge': z.string().optional().describe('Value to echo back when the handshake is accepted')
});

export type VerificationQuery = z.infer<typeof verificationQuerySchema>;

export class VerificationQueryDto extends createZodDto(verificationQuerySchema) {}

export const devInboundSchema = z.object({
    from: z.string().min(5).max(20).describe('Sender wa_id, digits only'),
    text: z.string().min(1).max(4096).describe('Text of the simulated message'),
    phoneNumberId: z.string().optional().describe('Receiving number id; omit for the hosted number')
});

export type DevInboundBody = z.infer<typeof devInboundSchema>;

export class DevInboundBodyDto extends createZodDto(devInboundSchema) {}

export const devMessageSchema = z.object({
    to: z.string(),
    kind: z.string(),
    wamid: z.string(),
    body: z.string().nullable()
});

export const devMessagesResponseSchema = z.object({ items: z.array(devMessageSchema) });
