import { z } from 'zod';

export const webhookEventSchema = z.object({
    id: z.string().min(1).max(200).describe('Event id; unique per event'),
    type: z.string().min(1).max(100).describe('Event type, such as invoice.paid'),
    occurredAt: z.string().optional().describe('When the event happened (ISO 8601)'),
    createdAt: z.string().optional().describe('Older name of occurredAt'),
    data: z.record(z.unknown()).default({}).describe('Event payload')
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

const text = z.string().min(1);

export const eventDataSchema = z.object({
    subscriptionId: text.optional(),
    invoiceId: text.optional(),
    customerExternalRef: z.string().optional(),
    customer: z.object({ externalRef: z.string().optional() }).optional(),
    totalCents: z.number().int().nonnegative().nullish(),
    method: z.string().optional(),
    dueDate: z.string().nullish(),
    cycleDate: z.string().nullish(),
    paidAt: z.string().nullish(),
    canceledAt: z.string().nullish(),
    brand: z.string().nullish(),
    lastFourDigits: z.string().nullish(),
    last4: z.string().nullish()
});

export type EventData = z.infer<typeof eventDataSchema>;

export const priceRequestSchema = z.object({
    version: z.number().int(),
    mode: z.enum(['live', 'test']),
    pricingRequestId: z.string().min(1),
    product: z.object({ externalRef: z.string().min(1) }),
    subscription: z.object({ externalRef: z.string().min(1) }),
    customer: z.object({ externalRef: z.string().min(1) }),
    period: z.object({ start: z.string().min(1), end: z.string().min(1) }),
    cycle: z.number().int(),
    currency: z.string().min(1)
});

export type PriceRequest = z.infer<typeof priceRequestSchema>;
