import { z } from 'zod';

/**
 * Formatos conferidos contra a API pública da Revtriever (revisão do #144): listas paginadas em
 * `{ data, pagination }`, eventos em `{ data, nextCursor }` e o cartão guardado embutido na assinatura.
 */
const method = z.enum(['card', 'pix']);
const nullableText = z.string().nullable();

function pageOf<T extends z.ZodTypeAny>(item: T): z.ZodObject<{ data: z.ZodArray<T>; pagination: typeof paginationSchema }> {
    return z.object({ data: z.array(item), pagination: paginationSchema });
}

const paginationSchema = z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalRecords: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative()
});

export const revtrieverSavedCardSchema = z.object({
    brand: nullableText,
    lastFourDigits: z.string().length(4),
    expiryMonth: z.number().int(),
    expiryYear: z.number().int()
});

export const revtrieverSubscriptionSchema = z.object({
    id: z.string().min(1),
    planId: z.string().min(1),
    status: z.enum(['active', 'canceled']),
    customer: z.object({ id: z.string().min(1), externalRef: z.string() }),
    paymentMethod: method,
    nextDueDate: nullableText,
    startedAt: nullableText,
    canceledAt: nullableText,
    card: revtrieverSavedCardSchema.nullable()
});

export const revtrieverInvoiceSchema = z.object({
    id: z.string().min(1),
    subscriptionId: z.string().min(1),
    cycle: z.number().int(),
    status: z.string().min(1),
    dueDate: nullableText,
    paymentDueDate: nullableText,
    paymentMethod: z.string().min(1),
    totalCents: z.number().int().nonnegative().nullable(),
    issuedAt: nullableText,
    paidAt: nullableText
});

export const revtrieverInvoicePageSchema = pageOf(revtrieverInvoiceSchema);

export const revtrieverCaptureSessionSchema = z.object({
    token: z.string().min(1),
    captureUrl: z.string().url(),
    expiresAt: z.string().min(1),
    returnUrl: nullableText
});

export const revtrieverPaymentLinkSchema = z.object({
    url: z.string().url(),
    kind: z.enum(['payment_page', 'gateway'])
});

export const revtrieverEventSchema = z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    occurredAt: z.string().min(1),
    data: z.record(z.unknown())
});

export const revtrieverEventPageSchema = z.object({
    data: z.array(revtrieverEventSchema),
    nextCursor: z.string().nullable()
});

export const revtrieverIntegrationSchema = z.object({
    gateways: z.array(z.object({ connectionId: z.string().min(1) }))
});

export const revtrieverProductSchema = z.object({
    id: z.string().min(1),
    externalRef: nullableText
});

export const revtrieverProductPageSchema = pageOf(revtrieverProductSchema);

export const revtrieverPricingTestSchema = z.object({ outcome: z.string().min(1) });

export const revtrieverPlanSummarySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    archivedAt: nullableText
});

export const revtrieverPlanPageSchema = pageOf(revtrieverPlanSummarySchema);

export const revtrieverPlanSchema = revtrieverPlanSummarySchema.extend({
    items: z.array(z.object({ productId: z.string().min(1) }))
});

export const revtrieverProblemSchema = z.object({
    type: z.string().nullish()
});
