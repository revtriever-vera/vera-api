import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const issueCodeRequestSchema = z
    .object({
        consent: z
            .boolean()
            .optional()
            .describe(
                'True when the person accepted sending aggregated figures to a language model; required while the account has not allowed it'
            )
    })
    .strict();

export const issuedCodeSchema = z.object({
    code: z.string().describe('Eight characters the person sends as "VINCULAR <code>"; shown once, only its hash is stored'),
    waLink: z.string().describe('wa.me link with the message ready to send from the person WhatsApp'),
    expiresAt: z.string().datetime().describe('When the code stops being valid')
});

export const linkViewSchema = z.object({
    status: z.enum(['none', 'pending', 'active', 'suspended']).describe('State of the link for the signed-in person'),
    phone: z.string().nullable().describe('The linked number with country code, only for the person who linked it'),
    linkedAt: z.string().datetime().nullable().describe('When the number was linked'),
    veraNumber: z.string().nullable().describe('Number the person writes to, digits only'),
    pending: z
        .object({ expiresAt: z.string().datetime().describe('When the pending code stops being valid') })
        .nullable()
        .describe('Pending code of the person; the code itself and its link are only returned when it is issued'),
    lastUnlinkReason: z
        .enum(['stale', 'premium_ended', 'member_removed', 'opt_out', 'user_chat', 'user_app', 'account_deleted'])
        .nullable()
        .describe('Why the last link ended, null when there is a link or there never was one'),
    consentRequired: z.boolean().describe('The account still has to allow sending aggregated figures to a language model')
});

export type IssueCodeRequest = z.infer<typeof issueCodeRequestSchema>;
export type IssuedCode = z.infer<typeof issuedCodeSchema>;
export type LinkView = z.infer<typeof linkViewSchema>;

export class IssueCodeRequestDto extends createZodDto(issueCodeRequestSchema) {}
