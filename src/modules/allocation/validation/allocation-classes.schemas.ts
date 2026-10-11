import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CLASS_COLOR_KEYS, CLASS_NAME_MAX_LENGTH, CLASS_NAME_MIN_LENGTH, SUBJECT_TYPES } from '../domain/allocation.types';

const CONTROL_CHARACTERS: RegExp = /^[^\p{Cc}]*$/u;

export const classNameSchema = z
    .string()
    .trim()
    .min(CLASS_NAME_MIN_LENGTH)
    .max(CLASS_NAME_MAX_LENGTH)
    .regex(CONTROL_CHARACTERS)
    .describe('Class name, trimmed, 1 to 40 characters without control characters; unique per company ignoring case');

const colorKeySchema = z.enum(CLASS_COLOR_KEYS).describe('Palette color key, `c1` to `c12` (design tokens `class-1` to `class-12`)');

export const assetClassViewSchema = z.object({
    id: z.string().uuid().describe('Class id'),
    systemKey: z.string().nullable().describe('Key of a default class; null for a class created by the user. Immutable'),
    aliasKeys: z
        .array(z.string())
        .describe('Default keys absorbed by merges; with `systemKey` they tell which class answers to a catalog suggestion'),
    name: z.string().nullable().describe('Name chosen by the user; null on a default class means "show the translated default name"'),
    colorKey: z.string().describe('Palette color key, `c1` to `c12`'),
    targetBps: z.number().int().describe('Target weight of the class in basis points (10000 = 100%)'),
    sortOrder: z.number().int().describe('Position of the class in the listing')
});

export const assetClassListSchema = z.object({
    data: z.array(assetClassViewSchema).describe('Classes of the company ordered by `sortOrder`')
});

export const createAssetClassSchema = z
    .object({
        name: classNameSchema,
        colorKey: colorKeySchema.optional().describe('Color of the class; omitted picks the lowest color not yet in use')
    })
    .strict();

export const updateAssetClassSchema = z
    .object({
        name: classNameSchema
            .nullable()
            .optional()
            .describe('New name; null restores the translated default name and is only accepted on a default class'),
        colorKey: colorKeySchema.optional().describe('New color of the class')
    })
    .strict();

export const mergeAssetClassSchema = z
    .object({
        intoClassId: z.string().uuid().describe('Class that receives the assets, the target and the default keys of this class')
    })
    .strict();

export const classIdParamsSchema = z.object({
    id: z.string().uuid().describe('Class id')
});

export const assignmentParamsSchema = z.object({
    subjectType: z.nativeEnum(SUBJECT_TYPES).describe('Kind of asset: `position` or `fixed_income`'),
    subjectId: z.string().uuid().describe('Id of the position or of the fixed income security')
});

export const reassignSchema = z
    .object({
        classId: z.string().uuid().describe('Class the asset moves to')
    })
    .strict();

export const classAssignmentViewSchema = z.object({
    subjectType: z.nativeEnum(SUBJECT_TYPES).describe('Kind of asset'),
    subjectId: z.string().uuid().describe('Id of the position or of the fixed income security'),
    classId: z.string().uuid().describe('Class the asset belongs to'),
    targetInClassBps: z
        .number()
        .int()
        .describe('Target weight of the asset inside its class in basis points; reset to 0 when the class changes')
});

export class CreateAssetClassDto extends createZodDto(createAssetClassSchema) {}
export class UpdateAssetClassDto extends createZodDto(updateAssetClassSchema) {}
export class MergeAssetClassDto extends createZodDto(mergeAssetClassSchema) {}
export class ClassIdParamsDto extends createZodDto(classIdParamsSchema) {}
export class AssignmentParamsDto extends createZodDto(assignmentParamsSchema) {}
export class ReassignDto extends createZodDto(reassignSchema) {}
