import { z } from 'zod';
import { MAX_RELEVANCE, MAX_SUMMARY_CHARS, SUMMARY_KIND_LIST } from './market-document-summary.types';

const PLAIN_TEXT: RegExp = /^[^<>]*$/;
const MAX_NUMBERS: number = 20;

export const marketDocumentSummaryOutputSchema = z
    .object({
        summary: z.string().min(1).max(MAX_SUMMARY_CHARS).regex(PLAIN_TEXT).describe('Two to three sentences about the document'),
        kind: z.enum(SUMMARY_KIND_LIST),
        relevance: z.number().int().min(0).max(MAX_RELEVANCE).describe('0 is noise, 3 changes what a holder should know'),
        discard: z.boolean().describe('true when the document is routine noise for a holder'),
        numbers: z.array(z.string().min(1)).max(MAX_NUMBERS).describe('Every figure cited in the summary, copied from the document')
    })
    .strict();

export type MarketDocumentSummaryOutput = z.infer<typeof marketDocumentSummaryOutputSchema>;
