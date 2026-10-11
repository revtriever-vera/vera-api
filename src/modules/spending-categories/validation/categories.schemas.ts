import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
    CATEGORY_KINDS,
    CATEGORY_NAME_MAX_LENGTH,
    CATEGORY_NAME_MIN_LENGTH,
    FLEXIBILITIES,
    ICON_KEYS,
    RULE_DIRECTIONS,
    RULE_MATCH_TYPES,
    RULE_PATTERN_INPUT_MAX_LENGTH,
    USER_CATEGORY_KINDS,
    USER_RULE_MATCH_TYPES
} from '../domain/categories.types';

const CONTROL_CHARACTERS: RegExp = /^[^\p{Cc}]*$/u;

const iconKeySchema = z.enum(ICON_KEYS).describe('Icon of the category, one of the 24 closed lucide icon names');
const flexibilitySchema = z.nativeEnum(FLEXIBILITIES).describe('`fixed` or `flexible`; only expense categories have it');
const directionSchema = z.nativeEnum(RULE_DIRECTIONS).describe('`out` matches negative amounts, `in` positive amounts, `any` both');

export const categoryNameSchema = z
    .string()
    .trim()
    .min(CATEGORY_NAME_MIN_LENGTH)
    .max(CATEGORY_NAME_MAX_LENGTH)
    .regex(CONTROL_CHARACTERS)
    .describe('Category name, trimmed, 1 to 40 characters without control characters; unique per company ignoring case');

export const categoryViewSchema = z.object({
    id: z.string().uuid().describe('Category id'),
    systemKey: z.string().nullable().describe('Key of a default category; null for a category created by the user. Immutable'),
    name: z.string().nullable().describe('Name chosen by the user; null on a default category means "show the translated default name"'),
    kind: z.nativeEnum(CATEGORY_KINDS).describe('`expense` counts as spending, `income` as income, `transfer` is left out of both'),
    flexibility: flexibilitySchema.nullable().describe('`fixed` or `flexible` for expense categories; null otherwise'),
    icon: iconKeySchema,
    position: z.number().int().describe('Position of the category in the listing'),
    isSystem: z.boolean().describe('True for the default categories, which cannot be deleted or change kind')
});

export const categoryListSchema = z.object({
    categories: z.array(categoryViewSchema).describe('Categories of the company ordered by `position`')
});

export const createCategorySchema = z
    .object({
        name: categoryNameSchema,
        kind: z.enum(USER_CATEGORY_KINDS).describe('`expense` or `income`; transfer categories exist only as defaults'),
        flexibility: flexibilitySchema.optional().describe('Required for `expense` and not accepted for `income`'),
        icon: iconKeySchema
    })
    .strict()
    .refine((body) => (body.kind === CATEGORY_KINDS.expense) === (body.flexibility !== undefined), {
        message: 'flexibility is required for expense categories and not accepted for income categories',
        path: ['flexibility']
    });

export const updateCategorySchema = z
    .object({
        name: categoryNameSchema
            .nullable()
            .optional()
            .describe('New name; null restores the translated default name and is only accepted on a default category'),
        flexibility: flexibilitySchema.optional().describe('New flexibility; only for expense categories'),
        icon: iconKeySchema.optional().describe('New icon; not accepted on a default category')
    })
    .strict();

export const categoryIdParamsSchema = z.object({
    id: z.string().uuid().describe('Category id')
});

export const removeCategoryQuerySchema = z.object({
    moveTo: z
        .string()
        .uuid()
        .optional()
        .describe(
            'Category that receives the transactions of the removed one; same kind required. Omitted lets the pipeline recategorize them'
        )
});

export const removedSchema = z.object({
    recategorized: z.number().int().describe('Transactions whose category changed because of this operation')
});

export const ruleViewSchema = z.object({
    id: z.string().uuid().describe('Rule id'),
    matchType: z
        .nativeEnum(RULE_MATCH_TYPES)
        .describe('`counterparty` (learned from a correction), `description` (whole description) or `contains`'),
    label: z.string().describe('Text shown to the user, e.g. the payee name; for counterparty rules never the document'),
    appliesTo: directionSchema,
    categoryId: z.string().uuid().describe('Category the rule assigns'),
    createdAt: z.string().datetime().describe('Creation instant, ISO 8601 UTC'),
    updatedAt: z.string().datetime().describe('Last change instant, ISO 8601 UTC')
});

export const ruleListSchema = z.object({
    rules: z.array(ruleViewSchema).describe('Rules of the company, newest first')
});

const rulePatternSchema = z
    .string()
    .trim()
    .min(1)
    .max(RULE_PATTERN_INPUT_MAX_LENGTH)
    .regex(CONTROL_CHARACTERS)
    .describe(
        'Text to match; it is normalized (no accents, uppercase, no punctuation) before saving and must keep 2 to 80 characters for `contains`'
    );

export const createRuleSchema = z
    .object({
        matchType: z
            .enum(USER_RULE_MATCH_TYPES)
            .describe('`description` matches the whole normalized description, `contains` a part of it'),
        pattern: rulePatternSchema,
        appliesTo: directionSchema,
        categoryId: z.string().uuid().describe('Category the rule assigns'),
        applyToPast: z.boolean().default(true).describe('Whether past transactions that match are recategorized now (default true)')
    })
    .strict();

export const ruleSavedSchema = z.object({
    rule: ruleViewSchema,
    recategorized: z.number().int().describe('Past transactions recategorized in the same transaction')
});

export const previewRuleSchema = z
    .object({
        matchType: z.enum(USER_RULE_MATCH_TYPES).describe('`description` or `contains`'),
        pattern: rulePatternSchema,
        appliesTo: directionSchema
    })
    .strict();

export const previewRuleResponseSchema = z.object({
    normalizedPattern: z.string().describe('Pattern as it would be saved'),
    matches: z.number().int().describe('Transactions the rule would affect')
});

export const updateRuleSchema = z
    .object({
        categoryId: z.string().uuid().optional().describe('New category of the rule'),
        appliesTo: directionSchema.optional()
    })
    .strict();

export const ruleIdParamsSchema = z.object({
    id: z.string().uuid().describe('Rule id')
});

export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
export class CategoryIdParamsDto extends createZodDto(categoryIdParamsSchema) {}
export class RemoveCategoryQueryDto extends createZodDto(removeCategoryQuerySchema) {}
export class CreateRuleDto extends createZodDto(createRuleSchema) {}
export class PreviewRuleDto extends createZodDto(previewRuleSchema) {}
export class UpdateRuleDto extends createZodDto(updateRuleSchema) {}
export class RuleIdParamsDto extends createZodDto(ruleIdParamsSchema) {}
