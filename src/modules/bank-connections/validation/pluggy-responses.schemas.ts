import { z } from 'zod';

export const pluggyAuthResponseSchema = z.object({
    apiKey: z.string().min(1)
});

export const pluggyItemResponseSchema = z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    executionStatus: z.string().nullish(),
    connector: z.object({ name: z.string().nullish() }).nullish(),
    lastUpdatedAt: z.string().nullish(),
    consentExpiresAt: z.string().nullish()
});

export type PluggyItemResponse = z.infer<typeof pluggyItemResponseSchema>;

const optionalText = z.string().nullish();

const partySchema = z.object({
    name: optionalText,
    documentNumber: z.object({ value: optionalText }).nullish()
});

export const pluggyAccountSchema = z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    subtype: optionalText,
    name: z.string().min(1),
    marketingName: optionalText,
    number: optionalText,
    currencyCode: z.string().min(1)
});

export const pluggyAccountsPageSchema = z.object({
    results: z.array(pluggyAccountSchema),
    page: z.number().int().positive().nullish(),
    totalPages: z.number().int().nonnegative().nullish()
});

export const pluggyTransactionSchema = z.object({
    id: z.string().min(1),
    accountId: z.string().min(1).nullish(),
    date: z.string().min(1),
    description: z.string(),
    descriptionRaw: optionalText,
    amount: z.number(),
    currencyCode: z.string().nullish(),
    amountInAccountCurrency: z.number().nullish(),
    status: z.string().nullish(),
    categoryId: optionalText,
    paymentData: z.object({ payer: partySchema.nullish(), receiver: partySchema.nullish() }).nullish(),
    merchant: z.object({ name: optionalText, businessName: optionalText, cnpj: optionalText }).nullish(),
    creditCardMetadata: z.object({ installmentNumber: z.number().int().nullish(), totalInstallments: z.number().int().nullish() }).nullish()
});

export const pluggyTransactionsV2PageSchema = z.object({
    items: z.array(pluggyTransactionSchema).optional(),
    results: z.array(pluggyTransactionSchema).optional(),
    next: optionalText
});

export const pluggyTransactionsLegacyPageSchema = z.object({
    results: z.array(pluggyTransactionSchema),
    page: z.number().int().positive().nullish(),
    totalPages: z.number().int().nonnegative().nullish()
});

export type PluggyAccountResponse = z.infer<typeof pluggyAccountSchema>;
export type PluggyTransactionResponse = z.infer<typeof pluggyTransactionSchema>;
