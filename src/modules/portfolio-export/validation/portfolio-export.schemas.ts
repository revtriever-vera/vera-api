import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const portfolioExportQuerySchema = z.object({
    format: z.enum(['xlsx', 'csv']).describe('File format: xlsx for a spreadsheet with numeric cells, csv for UTF-8 text with BOM')
});

export class PortfolioExportQueryDto extends createZodDto(portfolioExportQuerySchema) {}

export type PortfolioExportQuery = z.infer<typeof portfolioExportQuerySchema>;
