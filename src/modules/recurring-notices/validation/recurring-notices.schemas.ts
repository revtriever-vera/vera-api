import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const noticeBeforeParamsSchema = z.object({ id: z.string().uuid().describe('Series id') });

export const updateNoticeBeforeSchema = z
    .object({ enabled: z.boolean().describe('true to receive an e-mail the day before each charge of the series, false to stop') })
    .strict();

export const noticeBeforeSchema = z.object({
    seriesId: z.string().uuid(),
    enabled: z.boolean().describe('Whether the signed-in person gets the day-before e-mail for this series')
});

export const noticeBeforeListSchema = z.object({
    seriesIds: z.array(z.string().uuid()).describe('Series for which the signed-in person turned the day-before e-mail on')
});

export const schedulePayloadSchema = z.object({ companyId: z.string().uuid() });

export const weekPayloadSchema = z.object({ companyId: z.string().uuid(), monday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const duePayloadSchema = z.object({
    companyId: z.string().uuid(),
    seriesId: z.string().uuid(),
    userId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export type NoticeBeforeView = z.infer<typeof noticeBeforeSchema>;
export type NoticeBeforeListView = z.infer<typeof noticeBeforeListSchema>;

export class NoticeBeforeParamsDto extends createZodDto(noticeBeforeParamsSchema) {}
export class UpdateNoticeBeforeDto extends createZodDto(updateNoticeBeforeSchema) {}
