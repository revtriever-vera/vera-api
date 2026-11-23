import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LINK_STATUSES, SIGNUP_LINK_LIMITS, TRIAL_KINDS } from '../domain/signup-links.types';

const MAX_USES_CEILING: number = 1_000_000;
const MAX_CYCLE: number = 1200;
const MAX_LABEL: number = 80;
const LIST_LIMIT: number = 200;

export const discountRuleSchema = z.object({
    percent: z
        .number()
        .int()
        .min(SIGNUP_LINK_LIMITS.minPercent)
        .max(SIGNUP_LINK_LIMITS.maxPercent)
        .describe('Discount on the Premium price, from 1 to 90 percent'),
    fromCycle: z
        .number()
        .int()
        .min(1)
        .max(MAX_CYCLE)
        .describe('First paid cycle the rule covers (the first paid cycle is 1; trial days do not count)'),
    toCycle: z.number().int().min(1).max(MAX_CYCLE).describe('Last paid cycle the rule covers, inclusive')
});

export type DiscountRuleView = z.infer<typeof discountRuleSchema>;

export const trialSchema = z.object({
    kind: z
        .enum([TRIAL_KINDS.none, TRIAL_KINDS.card, TRIAL_KINDS.noCard])
        .describe(
            '`none`: no trial. `card`: trial with the card saved and the first charge at the end. `no_card`: Premium for N days without a card; the account goes back to Free if it does not subscribe'
        ),
    days: z
        .number()
        .int()
        .min(SIGNUP_LINK_LIMITS.minTrialDays)
        .max(SIGNUP_LINK_LIMITS.maxTrialDays)
        .nullable()
        .describe('Trial length in days (1 to 60); null when there is no trial')
});

export type TrialView = z.infer<typeof trialSchema>;

export const createSignupLinkSchema = z.object({
    label: z.string().trim().min(1).max(MAX_LABEL).describe('Internal name of the link, for the operators only'),
    trial: trialSchema.describe('The trial part of the offer'),
    rules: z
        .array(discountRuleSchema)
        .max(SIGNUP_LINK_LIMITS.maxRules)
        .default([])
        .describe('Discount scale by paid cycle, 0 to 20 rules; the first rule that matches the cycle wins'),
    maxUses: z
        .number()
        .int()
        .min(1)
        .max(MAX_USES_CEILING)
        .nullable()
        .default(null)
        .describe('How many accounts can redeem the link; null is unlimited (required with `no_card`)'),
    expiresAt: z
        .string()
        .datetime()
        .nullable()
        .default(null)
        .describe('When the link stops accepting new redemptions (required with `no_card`, at most 90 days ahead)')
});

export class CreateSignupLinkDto extends createZodDto(createSignupLinkSchema) {}

export const signupLinkIdParamsSchema = z.object({
    id: z.string().uuid().describe('Signup link id')
});

export class SignupLinkIdParamsDto extends createZodDto(signupLinkIdParamsSchema) {}

export const signupLinkTokenParamsSchema = z.object({
    token: z.string().min(16).max(128).describe('Token of the signup link, as it appears in the URL')
});

export class SignupLinkTokenParamsDto extends createZodDto(signupLinkTokenParamsSchema) {}

export const signupLinkSchema = z.object({
    id: z.string().uuid().describe('Link id'),
    token: z.string().describe('Token that goes in the signup URL'),
    url: z.string().url().describe('Signup URL to share'),
    label: z.string().describe('Internal name of the link'),
    trial: trialSchema,
    rules: z.array(discountRuleSchema).describe('Discount scale by paid cycle'),
    maxUses: z.number().int().nullable().describe('Redemption limit; null is unlimited'),
    expiresAt: z.string().datetime().nullable().describe('When the link stops accepting redemptions; null never expires'),
    status: z
        .enum([LINK_STATUSES.active, LINK_STATUSES.revoked, LINK_STATUSES.expired, LINK_STATUSES.exhausted])
        .describe('Whether the link still accepts redemptions'),
    redemptionCount: z.number().int().describe('Accounts that redeemed the link (uses)'),
    trialCount: z.number().int().describe('Redemptions that started a trial'),
    subscriptionCount: z.number().int().describe('Redemptions that ended up subscribing'),
    revokedAt: z.string().datetime().nullable().describe('When an operator revoked the link'),
    createdAt: z.string().datetime().describe('When the link was created')
});

export type SignupLinkView = z.infer<typeof signupLinkSchema>;

export const signupLinkListSchema = z.object({
    items: z.array(signupLinkSchema).describe(`Newest first, at most ${String(LIST_LIMIT)}`)
});

export type SignupLinkListView = z.infer<typeof signupLinkListSchema>;

export const publicOfferSchema = z.object({
    trial: trialSchema,
    rules: z.array(discountRuleSchema).describe('Discount scale by paid cycle'),
    expiresAt: z.string().datetime().nullable().describe('When the link stops accepting redemptions; null never expires')
});

export type PublicOfferView = z.infer<typeof publicOfferSchema>;

export const redeemOfferSchema = z.object({
    token: z.string().min(16).max(128).describe('Token of the signup link, as it appears in the URL')
});

export class RedeemOfferDto extends createZodDto(redeemOfferSchema) {}

export const redeemedOfferSchema = z.object({
    trial: trialSchema,
    rules: z.array(discountRuleSchema).describe('Discount scale by paid cycle'),
    redeemedAt: z.string().datetime().describe('When the account redeemed the link'),
    expiresAt: z.string().datetime().describe('Until when the offer can still start; after it, full price and no trial')
});

export type RedeemedOfferView = z.infer<typeof redeemedOfferSchema>;

export const SIGNUP_LINKS_LIST_LIMIT: number = LIST_LIMIT;
