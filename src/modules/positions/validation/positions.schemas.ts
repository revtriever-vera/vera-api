import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AVERAGE_PRICE_PATTERN, QUANTITY_PATTERN } from '../domain/positions.types';

export const quantitySchema = z
    .string()
    .regex(QUANTITY_PATTERN)
    .describe(
        'Decimal string, zero or more, up to 18 integer and 10 fractional digits, no sign or exponent. ' +
            'The decimal places allowed depend on the asset (B3 whole units, US up to 6, crypto up to 8, Tesouro 2)'
    );

export const averagePriceSchema = z
    .string()
    .regex(AVERAGE_PRICE_PATTERN)
    .nullable()
    .describe('Average price paid, decimal string zero or more, in the currency of the asset; null when unknown. Informational only');

export const createPositionSchema = z
    .object({
        assetId: z.string().uuid().describe('Id of an active asset of the catalog'),
        quantity: quantitySchema,
        averagePrice: averagePriceSchema.optional(),
        classId: z
            .string()
            .uuid()
            .optional()
            .describe('Class of the position; omitted uses the class suggested by the catalog for the asset')
    })
    .strict();

export const updatePositionSchema = z
    .object({
        quantity: quantitySchema.optional(),
        averagePrice: averagePriceSchema.optional()
    })
    .strict();

export const positionIdParamsSchema = z.object({
    id: z.string().uuid().describe('Position id')
});

export const positionViewSchema = z.object({
    id: z.string().uuid().describe('Position id'),
    assetId: z.string().uuid().describe('Id of the catalog asset'),
    quantity: z.string().describe('Quantity held, decimal string without trailing zeros'),
    averagePrice: z.string().nullable().describe('Average price paid in the asset currency, or null'),
    classId: z.string().uuid().describe('Class the position belongs to'),
    createdAt: z.string().datetime().describe('Creation instant, ISO 8601'),
    updatedAt: z.string().datetime().describe('Last change instant, ISO 8601')
});

export class CreatePositionDto extends createZodDto(createPositionSchema) {}
export class UpdatePositionDto extends createZodDto(updatePositionSchema) {}
export class PositionIdParamsDto extends createZodDto(positionIdParamsSchema) {}
