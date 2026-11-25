import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MAX_SCREEN_PATH_CHARS, MAX_TURN_CHARS } from '../domain/assistant-chat.types';

export const sendTurnBodySchema = z
    .object({
        conversationId: z
            .string()
            .uuid()
            .optional()
            .describe('Conversation to continue; omitted, the current one is used or a new one is opened'),
        text: z.string().trim().min(1).max(MAX_TURN_CHARS).describe('The question, up to 1000 characters'),
        screen: z
            .object({ path: z.string().min(1).max(MAX_SCREEN_PATH_CHARS).describe('Route path of the screen the person is on') })
            .optional()
            .describe('The screen the person is on, so "this screen" can be understood')
    })
    .strict();

export const turnIdParamsSchema = z.object({ id: z.string().uuid().describe('Turn id, as returned when the question was sent') });

export const conversationIdParamsSchema = z.object({ id: z.string().uuid().describe('Conversation id') });

export const feedbackBodySchema = z
    .object({ helpful: z.literal(false).describe('Only the negative signal is collected; nothing of the text is kept') })
    .strict();

const usageSchema = z.object({
    state: z.enum(['ok', 'warning', 'paused']).describe('State of the usage band that applies to the next turn'),
    usedBps: z.number().int().describe('Share of that band used, in basis points'),
    resetsAt: z.string().describe('When the usage resets, ISO 8601')
});

export const turnStartedResponseSchema = z.object({
    turnId: z.string().uuid().describe('Id to poll for the answer'),
    conversationId: z.string().uuid().describe('Conversation the turn belongs to')
});

export const turnResponseSchema = z.object({
    status: z.enum(['pending', 'done', 'failed']).describe('pending while the answer is written'),
    answer: z
        .object({
            text: z.string().describe('The answer, in markdown'),
            source: z.enum(['help', 'ai']).describe('help: from the help content; ai: from the language model with the account figures'),
            toolsUsed: z.array(z.string()).describe('Names of the tools the answer used'),
            sentAvailable: z.boolean().describe('The figures sent to the language model are still stored'),
            notice: z.string().nullable().describe('Investment notice line, when the answer needs one')
        })
        .optional()
        .describe('Present when the status is done'),
    usage: usageSchema.describe('Usage band, so the panel shows the quota without another call')
});

export const sentResponseSchema = z.object({
    sent: z
        .array(
            z.object({
                tool: z.string().describe('Name of the tool whose result went to the language model'),
                payload: z
                    .record(z.string(), z.unknown())
                    .describe('The result exactly as it was serialized to the language model: aggregates, keys and markers only')
            })
        )
        .describe('What went to the language model in this turn, in order; empty when nothing was sent or it was already erased')
});

export const conversationResponseSchema = z.object({
    conversationId: z.string().uuid().nullable().describe('Current conversation, null when there is none'),
    messages: z
        .array(
            z.object({
                id: z.string().uuid().describe('Message id; for a vera message it is also the turn id'),
                role: z.enum(['person', 'vera']).describe('Who wrote it'),
                text: z.string().describe('The text'),
                status: z.enum(['pending', 'done', 'failed']).describe('Status of the message'),
                toolsUsed: z.array(z.string()).describe('Tools the answer used'),
                notice: z.string().nullable().describe('Investment notice line, when the answer needs one'),
                createdAt: z.string().describe('ISO 8601')
            })
        )
        .describe('The last 20 messages, oldest first'),
    usage: usageSchema.nullable().describe('Usage band that applies to the next turn'),
    enabled: z.boolean().describe('Whether the language model is on; false means the ask-Vera button must be hidden')
});

export type SendTurnBody = z.infer<typeof sendTurnBodySchema>;
export type TurnView = z.infer<typeof turnResponseSchema>;
export type TurnStartedView = z.infer<typeof turnStartedResponseSchema>;
export type SentView = z.infer<typeof sentResponseSchema>;
export type ConversationView = z.infer<typeof conversationResponseSchema>;
export type UsageView = z.infer<typeof usageSchema>;

export class SendTurnBodyDto extends createZodDto(sendTurnBodySchema) {}
export class TurnIdParamsDto extends createZodDto(turnIdParamsSchema) {}
export class ConversationIdParamsDto extends createZodDto(conversationIdParamsSchema) {}
export class FeedbackBodyDto extends createZodDto(feedbackBodySchema) {}
