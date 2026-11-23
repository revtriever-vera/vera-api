import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ISSUER_KINDS, ISSUER_SEARCH_LIMIT, ISSUER_SEARCH_MAX_TEXT_LENGTH, ISSUER_STATUSES } from '../domain/issuer.types';

export const issuerSearchQuerySchema = z.object({
    q: z
        .string()
        .trim()
        .max(ISSUER_SEARCH_MAX_TEXT_LENGTH)
        .optional()
        .describe('Fragment of the institution name, alias or group name, up to 60 characters; accents and case are ignored'),
    kind: z
        .enum([ISSUER_KINDS.bank, ISSUER_KINDS.company])
        .optional()
        .describe('`bank` for CDB, LCI, LCA and LC issuers; `company` for debenture, CRI and CRA issuers; omitted searches every kind')
});

export class IssuerSearchQueryDto extends createZodDto(issuerSearchQuerySchema) {}

export type IssuerSearchQuery = z.infer<typeof issuerSearchQuerySchema>;

export const issuerItemSchema = z.object({
    id: z.string().describe('Stable slug of the institution, e.g. banco-inter'),
    name: z.string().describe('Institution name'),
    groupId: z.string().describe('Slug of the prudential conglomerate or business group the institution belongs to'),
    groupName: z.string().describe('Name of the conglomerate or group, after following any incorporation'),
    kind: z.nativeEnum(ISSUER_KINDS).describe('`bank`, `company` or `sovereign`'),
    fgcAssociated: z.boolean().describe('Whether the institution is associated to the FGC'),
    status: z.nativeEnum(ISSUER_STATUSES).describe('`retired` institutions only show up when the search matches the name exactly')
});

export type IssuerItem = z.infer<typeof issuerItemSchema>;

export const issuerSearchResponseSchema = z.object({
    items: z.array(issuerItemSchema).describe(`Institutions ordered by relevance, at most ${String(ISSUER_SEARCH_LIMIT)}`)
});

export type IssuerSearchResponse = z.infer<typeof issuerSearchResponseSchema>;
