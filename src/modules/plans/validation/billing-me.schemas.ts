import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const featureStateSchema = z
    .enum(['available', 'premium_required', 'paused', 'disabled'])
    .describe(
        'available: can be used; premium_required: needs the Premium plan; paused: the monthly cap was reached; disabled: no key in this installation'
    );

const usedBpsSchema = z.object({ usedBps: z.number().int().min(0).describe('Share of the monthly cap used, in basis points') });

export const billingOfferSchema = z.object({
    trial: z
        .object({
            kind: z
                .enum(['none', 'card', 'no_card'])
                .describe('`none`: no trial; `card`: trial with the card saved; `no_card`: Premium for N days without a card'),
            days: z.number().int().nullable().describe('Trial length in days; null when there is no trial')
        })
        .describe('The trial part of the redeemed offer'),
    rules: z
        .array(
            z.object({
                percent: z.number().int().describe('Discount on the Premium price, in percent'),
                fromCycle: z.number().int().describe('First paid cycle the rule covers'),
                toCycle: z.number().int().describe('Last paid cycle the rule covers, inclusive')
            })
        )
        .describe('Discount scale by paid cycle; the first rule that matches wins'),
    redeemedAt: z.string().describe('When the account redeemed the link (ISO 8601)'),
    expiresAt: z.string().describe('Until when the offer can still start (ISO 8601); after it, full price and no trial')
});

export const billingMeSchema = z.object({
    mode: z.enum(['hosted', 'self_hosted']).describe('Deployment mode of this installation'),
    plan: z.enum(['free', 'premium', 'self_hosted']).describe('Effective plan of the signed-in company'),
    canManage: z.boolean().describe('True when the signed-in user is the owner and can change the plan'),
    methods: z.array(z.enum(['card', 'pix'])).describe('Payment methods offered; empty when self-hosted'),
    priceCents: z.number().int().nullable().describe('Premium monthly price in cents of BRL; null when self-hosted'),
    currency: z.literal('BRL').describe('Currency of the price'),
    subscription: z
        .object({
            status: z
                .enum(['pending', 'active', 'trialing', 'past_due', 'canceled', 'expired'])
                .describe('Subscription status; `trialing` while the card trial runs and nothing was charged yet'),
            method: z.enum(['card', 'pix']).describe('Chosen payment method'),
            since: z.string().nullable().describe('When the subscription started (ISO 8601)'),
            paidThrough: z.string().nullable().describe('End of the paid cycle (ISO 8601)'),
            nextChargeAt: z.string().nullable().describe('Next charge (ISO 8601); null once canceled'),
            card: z
                .object({ brand: z.string().describe('Card brand'), last4: z.string().describe('Last four digits') })
                .nullable()
                .describe('Saved card, when there is one'),
            graceEndsAt: z.string().nullable().describe('End of the grace period after an overdue invoice (ISO 8601)'),
            withdrawalEndsAt: z.string().nullable().describe('End of the 7-day withdrawal window (ISO 8601)'),
            canResume: z.boolean().describe('True when a canceled subscription can be resumed')
        })
        .nullable()
        .describe('Subscription summary; null when there is none'),
    openInvoice: z
        .object({
            id: z.string().describe('Invoice id'),
            status: z.enum(['issued', 'overdue']).describe('Invoice status'),
            totalCents: z.number().int().describe('Invoice total in cents of BRL'),
            dueDate: z.string().describe('Due date (ISO 8601)')
        })
        .nullable()
        .describe('Invoice waiting for payment; null when there is none'),
    trial: z
        .object({
            kind: z
                .enum(['no_card', 'card'])
                .describe(
                    '`no_card`: opened without a card; `card`: the card is saved and the first charge waits for the end of the trial'
                ),
            endsAt: z.string().describe('When the trial ends (ISO 8601); with a card it is the day of the first charge'),
            daysLeft: z.number().int().min(0).describe('Whole days left, rounded up')
        })
        .nullable()
        .describe('Premium trial in course; null when there is none'),
    offer: billingOfferSchema
        .nullable()
        .describe('Signup-link offer redeemed by this account and still within its 30 days; null when there is none'),
    features: z
        .object({
            ai: featureStateSchema.describe('Text summaries and the assistant'),
            whatsapp: featureStateSchema.describe('Vera on WhatsApp'),
            calendar: featureStateSchema.describe('Google Calendar and reminders')
        })
        .describe('State of each paid feature'),
    usage: z
        .object({
            usedBps: z.number().int().min(0).describe('Share of the monthly cap used, in basis points'),
            state: z.enum(['ok', 'warning', 'paused']).describe('ok, warning from 80%, paused at 100%'),
            resetsAt: z.string().describe('When the period turns (ISO 8601)'),
            byFeature: z.object({ ai: usedBpsSchema, whatsapp: usedBpsSchema }).describe('Usage by feature'),
            capMicros: z.number().int().nullable().describe('Cap in micros of BRL; only for self-hosted with a cap')
        })
        .nullable()
        .describe('Paid usage of the month; null when nothing meters it')
});

export class BillingMeDto extends createZodDto(billingMeSchema) {}
export type BillingMe = z.infer<typeof billingMeSchema>;
