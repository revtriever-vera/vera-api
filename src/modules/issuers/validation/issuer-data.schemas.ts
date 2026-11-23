import { z } from 'zod';
import { ISSUER_KINDS, ISSUER_STATUSES } from '../domain/issuer.types';

const SLUG: RegExp = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const slugSchema = z.string().regex(SLUG);

export const institutionSchema = z
    .object({
        id: slugSchema,
        name: z.string().trim().min(1).max(80),
        groupId: slugSchema,
        kind: z.nativeEnum(ISSUER_KINDS),
        fgcAssociated: z.boolean(),
        status: z.nativeEnum(ISSUER_STATUSES),
        mergedInto: slugSchema.nullable(),
        aliases: z.array(z.string().trim().min(1).max(80))
    })
    .strict();

export const institutionsSchema = z.array(institutionSchema);

export const groupSchema = z.object({ id: slugSchema, name: z.string().trim().min(1).max(80) }).strict();

export const groupsSchema = z.array(groupSchema);

export const knownIdsSchema = z.array(slugSchema);
