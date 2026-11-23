import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const subscribeSchema = z.object({
    method: z.enum(['card', 'pix']).describe('Payment method of the subscription')
});
export class SubscribeDto extends createZodDto(subscribeSchema) {}

export const subscribeResultSchema = z.union([
    z.object({
        next: z.literal('card_capture').describe('The person must save the card on the payment page'),
        captureUrl: z.string().describe('Page where the card is saved; open it right away, it is never stored')
    }),
    z.object({ next: z.literal('pay_invoice').describe('The first invoice arrives by event; pay it from the open invoice') })
]);

export const captureSessionResultSchema = z.object({
    captureUrl: z.string().describe('Page where the card is saved; open it right away, it is never stored')
});

export const invoicesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1).describe('Page number, 12 invoices per page')
});
export class InvoicesQueryDto extends createZodDto(invoicesQuerySchema) {}

const invoiceItemSchema = z.object({
    id: z.string().describe('Invoice id'),
    cycleStart: z.string().nullable().describe('Start of the cycle the invoice pays (ISO 8601)'),
    cycleEnd: z.string().nullable().describe('End of the cycle the invoice pays (ISO 8601)'),
    totalCents: z.number().int().nullable().describe('Invoice total in cents of BRL; null while the price is pending'),
    method: z.enum(['card', 'pix']).nullable().describe('Payment method of the invoice'),
    status: z.enum(['issued', 'overdue', 'paid']).describe('Invoice status'),
    dueDate: z.string().nullable().describe('Due date (ISO 8601)'),
    paidAt: z.string().nullable().describe('When it was paid (ISO 8601)')
});

export const invoicesPageSchema = z.object({
    items: z.array(invoiceItemSchema).describe('Invoices of this page, newest first'),
    page: z.number().int().describe('Current page'),
    total: z.number().int().describe('Total of invoices')
});
export type InvoicesPageView = z.infer<typeof invoicesPageSchema>;

export const paymentLinkSchema = z.object({
    url: z.string().describe('Page to pay the invoice, or the receipt of a paid one; never stored'),
    kind: z.enum(['payment_page', 'gateway']).describe('payment_page: pay here; gateway: receipt of the gateway')
});

export const cancelResultSchema = z.object({ endedNow: z.boolean().describe('True when the withdrawal window ended Premium at once') });
