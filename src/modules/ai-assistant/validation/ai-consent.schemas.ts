import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const consentRequestSchema = z
    .object({
        noticeVersion: z.number().int().min(1).describe('Version of the notice the person read and accepted; must be the current one'),
        source: z.enum(['summary_card', 'privacy_settings']).describe('Where the person accepted: the summary card or the privacy settings')
    })
    .strict();

export const consentViewSchema = z.object({
    available: z.boolean().describe('The plan and the installation allow the AI features'),
    granted: z.boolean().describe('The account allowed sending aggregated figures with the current notice'),
    needsConsent: z.boolean().describe('The permission request must be shown: not granted, revoked or accepted on an older notice'),
    noticeVersion: z.number().int().describe('Current notice version'),
    acceptedNoticeVersion: z.number().int().nullable().describe('Notice version the account accepted, null when never accepted'),
    grantedAt: z.string().datetime().nullable().describe('When the permission was given, null when never given'),
    source: z
        .enum(['summary_card', 'privacy_settings', 'whatsapp_link'])
        .nullable()
        .describe('Where the permission was given, null when never given'),
    canChange: z.boolean().describe('The signed-in member may turn the permission on and off (owner and editor)')
});

export type ConsentRequest = z.infer<typeof consentRequestSchema>;
export type ConsentView = z.infer<typeof consentViewSchema>;

export class ConsentRequestDto extends createZodDto(consentRequestSchema) {}
