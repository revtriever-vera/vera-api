import { z } from 'zod';

export const importProposalPayloadSchema = z.object({
    previewId: z.string().uuid(),
    documentType: z.string().nullable(),
    notes: z.array(z.object({ code: z.string(), count: z.number().int() }))
});

export type ImportProposalPayload = z.infer<typeof importProposalPayloadSchema>;
