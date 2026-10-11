import { z } from 'zod';

export const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const base64UrlField = z.string().regex(BASE64URL_PATTERN);

export const sealedEnvelopeSchema = z
    .object({
        v: z.literal(1),
        d: z.enum(['kms', 'local']),
        k: z.string().min(1),
        e: base64UrlField.optional(),
        i: base64UrlField,
        t: base64UrlField,
        c: z.string().regex(/^[A-Za-z0-9_-]*$/)
    })
    .strict()
    .refine((value: { d: string; e?: string }): boolean => (value.d === 'kms') === (value.e !== undefined));
