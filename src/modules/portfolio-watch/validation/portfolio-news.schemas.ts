import { z } from 'zod';

export const NEWS_TOOL_MAX_DAYS: number = 30;
export const NEWS_TOOL_DEFAULT_DAYS: number = 7;
const MAX_KEY_CHARS: number = 64;

export const portfolioNewsInputSchema = z
    .object({
        classId: z
            .string()
            .trim()
            .min(1)
            .max(MAX_KEY_CHARS)
            .optional()
            .describe('Only the assets of this asset class: the key ("chave") of the class as portfolio_overview returned it'),
        assetKey: z.string().trim().min(1).max(MAX_KEY_CHARS).optional().describe('Only this asset: its ticker, as the person wrote it'),
        days: z
            .number()
            .int()
            .min(1)
            .max(NEWS_TOOL_MAX_DAYS)
            .optional()
            .describe(`Days back from today, up to ${String(NEWS_TOOL_MAX_DAYS)}; ${String(NEWS_TOOL_DEFAULT_DAYS)} when omitted`)
    })
    .strict();

export type PortfolioNewsInput = z.infer<typeof portfolioNewsInputSchema>;
