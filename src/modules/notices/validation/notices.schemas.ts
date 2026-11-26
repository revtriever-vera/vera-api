import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const noticeSettingSchema = z.object({
    type: z.string().describe('Notice type code, for example `goal_behind`'),
    enabled: z.boolean().describe('Whether the signed-in person receives this notice by e-mail; true until they turn it off')
});

export const noticePreferencesSchema = z.object({
    items: z.array(noticeSettingSchema).describe('One entry per notice type the platform can send, sorted by type')
});

export const updateNoticePreferenceSchema = z
    .object({
        type: z.string().trim().min(1).max(64).describe('Notice type code, one of the types returned by GET /notifications/preferences'),
        enabled: z.boolean().describe('true to receive the notice by e-mail, false to stop receiving it')
    })
    .strict();

export class UpdateNoticePreferenceDto extends createZodDto(updateNoticePreferenceSchema) {}

export const unsubscribeParamsSchema = z.object({
    token: z.string().min(1).max(512).describe('Signed token from the unsubscribe link in the e-mail footer')
});

export class UnsubscribeParamsDto extends createZodDto(unsubscribeParamsSchema) {}

export const unsubscribeResultSchema = z.object({
    type: z.string().describe('Notice type code the person no longer receives; several codes joined by a comma when the link came from a grouped e-mail')
});

export type NoticePreferencesView = z.infer<typeof noticePreferencesSchema>;
export type NoticeSettingView = z.infer<typeof noticeSettingSchema>;
export type UnsubscribeResult = z.infer<typeof unsubscribeResultSchema>;
