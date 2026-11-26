import { z } from 'zod';
import { JsonValue } from '../../../core/llm/llm.types';
import { MAX_SCREEN_PATH_CHARS } from '../domain/assistant-chat.types';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)])
);

const importProposalSchema = z.object({
    summary: z.string().min(1).max(300),
    payload: z.record(z.string(), jsonValueSchema)
});

export const turnRequestedSchema = z.object({
    turnId: z.string().uuid(),
    questionId: z.string().uuid(),
    userId: z.string().uuid(),
    locale: z.enum(['pt-BR', 'en']),
    screenPath: z.string().min(1).max(MAX_SCREEN_PATH_CHARS).optional(),
    importProposal: importProposalSchema.optional()
});

export type TurnRequestedPayload = z.infer<typeof turnRequestedSchema>;
