import { z } from 'zod';

export const MAX_PARAGRAPHS: number = 4;
export const MAX_PARAGRAPH_CHARS: number = 280;
export const MAX_TOTAL_CHARS: number = 900;

const PLAIN_TEXT: RegExp = /^[^<>]*$/;

export const summaryOutputSchema = z
    .object({
        paragraphs: z
            .array(z.string().min(1).max(MAX_PARAGRAPH_CHARS).regex(PLAIN_TEXT))
            .min(1)
            .max(MAX_PARAGRAPHS)
            .describe('The summary, one idea per paragraph; the main figure of a paragraph may be wrapped in ** **')
    })
    .strict();

export const storedParagraphsSchema = z.array(z.string());

export type SummaryOutput = z.infer<typeof summaryOutputSchema>;
