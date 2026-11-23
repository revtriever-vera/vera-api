import { z } from 'zod';

const method = z.enum(['card', 'pix']);
const optionalText = z.string().nullish();

export const revtrieverSubscriptionSchema = z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    planId: z.string().min(1),
    customerId: optionalText,
    paymentMethod: method,
    firstChargeDate: optionalText,
    canceledAt: optionalText
});

export const revtrieverInvoiceSchema = z.object({
    id: z.string().min(1),
    subscriptionId: z.string().min(1),
    status: z.string().min(1),
    totalCents: z.number().int().nonnegative(),
    method: method.nullish(),
    dueDate: optionalText,
    cycleStart: optionalText,
    cycleEnd: optionalText,
    issuedAt: optionalText,
    paidAt: optionalText,
    overdueAt: optionalText
});

export const revtrieverInvoicePageSchema = z.object({
    items: z.array(revtrieverInvoiceSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative()
});

export const revtrieverCaptureSessionSchema = z.object({
    captureUrl: z.string().url(),
    expiresAt: z.string().min(1)
});

export const revtrieverSavedCardSchema = z.object({
    card: z.object({ brand: z.string().min(1), last4: z.string().length(4) }).nullable()
});

export const revtrieverPaymentLinkSchema = z.object({
    url: z.string().url(),
    kind: z.enum(['payment_page', 'gateway'])
});

export const revtrieverEventSchema = z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    createdAt: z.string().min(1),
    data: z.record(z.unknown())
});

export const revtrieverEventPageSchema = z.object({
    items: z.array(revtrieverEventSchema),
    next: z.string().nullable()
});

export const revtrieverIntegrationSchema = z.object({
    mode: z.enum(['live', 'test']).optional()
});

export const revtrieverProductSchema = z.object({
    id: z.string().min(1),
    externalRef: z.string().min(1)
});

export const revtrieverProductListSchema = z.object({ items: z.array(revtrieverProductSchema) });

export const revtrieverPricingTestSchema = z.object({ ok: z.boolean() });

export const revtrieverPlanSchema = z.object({
    id: z.string().min(1),
    externalRef: z.string().min(1),
    productId: z.string().min(1)
});

export const revtrieverPlanListSchema = z.object({ items: z.array(revtrieverPlanSchema) });

export const revtrieverProblemSchema = z.object({
    type: z.string().nullish()
});
