import { z } from 'zod';
import { MAX_SCREEN_PATH_CHARS } from '../domain/assistant-chat.types';

export const turnRequestedSchema = z.object({
    turnId: z.string().uuid(),
    questionId: z.string().uuid(),
    userId: z.string().uuid(),
    locale: z.enum(['pt-BR', 'en']),
    screenPath: z.string().min(1).max(MAX_SCREEN_PATH_CHARS).optional()
});

export type TurnRequestedPayload = z.infer<typeof turnRequestedSchema>;
