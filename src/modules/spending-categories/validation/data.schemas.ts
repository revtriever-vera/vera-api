import { z } from 'zod';
import { RULE_DIRECTIONS, SYSTEM_CATEGORY_KEYS } from '../domain/categories.types';

const systemKeySchema = z.nativeEnum(SYSTEM_CATEGORY_KEYS);

export const dictionaryEntrySchema = z
    .object({
        pattern: z.string().min(2).max(60),
        match: z.enum(['contains', 'prefix']),
        category: systemKeySchema,
        direction: z.nativeEnum(RULE_DIRECTIONS)
    })
    .strict();

export const merchantDictionarySchema = z.array(dictionaryEntrySchema);

export type DictionaryEntry = z.infer<typeof dictionaryEntrySchema>;

export const pluggyCategoryEntrySchema = z
    .object({
        pluggyId: z.string().regex(/^\d{8}$/),
        category: systemKeySchema
    })
    .strict();

export const pluggyCategoryMapSchema = z.array(pluggyCategoryEntrySchema);

export type PluggyCategoryEntry = z.infer<typeof pluggyCategoryEntrySchema>;
