import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MAX_BPS, SUBJECT_TYPES } from '../domain/allocation.types';
import { assetClassListSchema } from './allocation-classes.schemas';

const bpsSchema = z.number().int().min(0).max(MAX_BPS);

export const classTargetsBodySchema = z
    .object({
        targets: z
            .array(
                z
                    .object({
                        classId: z.string().uuid().describe('Class id'),
                        targetBps: bpsSchema.describe('Target weight of the class in basis points (10000 = 100%)')
                    })
                    .strict()
            )
            .min(1)
            .refine((items) => new Set(items.map((item) => item.classId)).size === items.length, {
                message: 'Each classId may appear only once'
            })
            .describe(
                'Targets to write; classes left out keep their current target. The sum over all classes of the company must be exactly 10000'
            )
    })
    .strict();

export const assetTargetsBodySchema = z
    .object({
        targets: z
            .array(
                z
                    .object({
                        subjectType: z.nativeEnum(SUBJECT_TYPES).describe('Kind of asset: `position` or `fixed_income`'),
                        subjectId: z.string().uuid().describe('Id of the position or of the fixed income security'),
                        targetInClassBps: bpsSchema.describe('Target weight of the asset inside the class in basis points')
                    })
                    .strict()
            )
            .describe('Every asset of the class exactly once. The sum must be 10000, or every value must be 0 (equal split)')
    })
    .strict();

export const assetTargetsViewSchema = z.object({
    classId: z.string().uuid().describe('Class the targets belong to'),
    targets: z
        .array(
            z.object({
                subjectType: z.nativeEnum(SUBJECT_TYPES).describe('Kind of asset'),
                subjectId: z.string().uuid().describe('Id of the position or of the fixed income security'),
                targetInClassBps: z.number().int().describe('Target weight of the asset inside the class in basis points')
            })
        )
        .describe('Targets of every asset of the class')
});

export const classTargetsViewSchema = assetClassListSchema;

export const targetsClassParamsSchema = z.object({
    classId: z.string().uuid().describe('Class id')
});

export class ClassTargetsBodyDto extends createZodDto(classTargetsBodySchema) {}
export class AssetTargetsBodyDto extends createZodDto(assetTargetsBodySchema) {}
export class TargetsClassParamsDto extends createZodDto(targetsClassParamsSchema) {}
