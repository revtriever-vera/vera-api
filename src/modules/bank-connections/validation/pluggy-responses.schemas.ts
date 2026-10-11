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
