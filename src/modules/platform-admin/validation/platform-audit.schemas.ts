import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MAX_LIMIT: number = 200;
const DEFAULT_LIMIT: number = 50;

export const auditQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).describe('How many of the most recent entries to return')
});

export class AuditQueryDto extends createZodDto(auditQuerySchema) {}

export const auditEntrySchema = z.object({
    id: z.string().uuid().describe('Entry id'),
    action: z.string().describe('What happened, for example `admin.login` or `admin.denied`'),
    operatorUserId: z.string().uuid().nullable().describe('Platform user behind the action; null when nobody was identified'),
    targetCompanyId: z.string().uuid().nullable().describe('Company the action is about, when there is one'),
    meta: z.record(z.string(), z.unknown()).describe('Facts of the action; never credentials'),
    createdAt: z.string().datetime().describe('When it happened')
});

export type AuditEntryView = z.infer<typeof auditEntrySchema>;

export const auditListSchema = z.object({
    items: z.array(auditEntrySchema).describe('Most recent first')
});

export type AuditListView = z.infer<typeof auditListSchema>;
