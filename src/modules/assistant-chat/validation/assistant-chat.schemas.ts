import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MAX_IMPORT_CORRECTIONS, MAX_SCREEN_PATH_CHARS, MAX_TURN_CHARS } from '../domain/assistant-chat.types';

export const sendTurnBodySchema = z
    .object({
        conversationId: z
            .string()
            .uuid()
            .optional()
            .describe('Conversation to continue; omitted, the current one is used or a new one is opened'),
        text: z
            .string()
            .trim()
            .min(1)
            .max(MAX_TURN_CHARS)
            .optional()
            .describe('The question, up to 1000 characters; required unless a `file` is sent'),
        screen: z
            .object({ path: z.string().min(1).max(MAX_SCREEN_PATH_CHARS).describe('Route path of the screen the person is on') })
            .optional()
            .describe('The screen the person is on, so "this screen" can be understood (JSON body)'),
        screenPath: z
            .string()
            .min(1)
            .max(MAX_SCREEN_PATH_CHARS)
            .optional()
            .describe('Same as `screen.path`, for the multipart form where an object cannot be sent'),
        modelConsent: z
            .enum(['true', 'false'])
            .optional()
            .describe(
                'Multipart only. Send `true` after the person agrees that the `file` goes to a language model (a PDF, image or photo). Without it, such a file is refused with model.confirmation_required and nothing is sent. Valid only for this request'
            )
    })
    .strict();

export const turnIdParamsSchema = z.object({ id: z.string().uuid().describe('Turn id, as returned when the question was sent') });

export const conversationIdParamsSchema = z.object({ id: z.string().uuid().describe('Conversation id') });

export const feedbackBodySchema = z
    .object({ helpful: z.literal(false).describe('Only the negative signal is collected; nothing of the text is kept') })
    .strict();

const accessSchema = z
    .enum(['ok', 'premium_required', 'permission_required'])
    .describe(
        'Whether the answer was held back: premium_required when the plan lacks the feature, permission_required when the plan has it but the person did not allow sending the figures to the language model, ok otherwise. For a held-back answer, it reflects the state at read time'
    );

export const actionIdParamsSchema = z.object({
    id: z.string().uuid().describe('Pending action id, as returned in the answer of the turn')
});

export const confirmActionBodySchema = z
    .object({
        transactionId: z.string().uuid().optional().describe('Transaction the person picked on the card, for actions that need one'),
        version: z.string().min(1).max(40).optional().describe('Version of the picked transaction, as listed on the card'),
        edits: z
            .array(z.record(z.string(), z.unknown()))
            .max(MAX_IMPORT_CORRECTIONS)
            .optional()
            .describe('Import cards only: corrections by line, the `edits` of POST /investment-imports'),
        fixedIncome: z
            .array(z.record(z.string(), z.unknown()))
            .max(MAX_IMPORT_CORRECTIONS)
            .optional()
            .describe('Import cards only: decision by fixed income line, the `fixedIncome` of POST /investment-imports'),
        always: z
            .boolean()
            .optional()
            .describe(
                'Categorize cards only: whether to also save the "always to this category" rule. When sent, it replaces what the assistant proposed; other cards answer 422 (assistant.action_always_not_applicable)'
            )
    })
    .strict();

export const actionSummarySchema = z.object({
    id: z.string().uuid().describe('Pending action id'),
    tool: z.string().describe('Action kind: goal_create or transaction_categorize'),
    summary: z.string().describe('What will happen if the person confirms, in the voice of Vera'),
    status: z
        .enum(['open', 'confirmed', 'canceled', 'expired', 'stale'])
        .describe('open while waiting for the person; expired is reported once the confirmation window passed'),
    expiresAt: z.string().describe('When the confirmation window ends, ISO 8601'),
    resultText: z.string().nullable().describe('What was done, once confirmed'),
    reference: z.string().nullable().describe('Id of what the action created, once confirmed: the importId for an import')
});

const actionCandidateSchema = z.object({
    id: z.string().uuid().describe('Transaction id'),
    version: z.string().describe('Version of the transaction, to send back when it is picked'),
    date: z.string().describe('Transaction date, YYYY-MM-DD'),
    description: z.string().describe('Transaction description, shown on the card only'),
    amountMinor: z.number().int().describe('Signed amount in minor units'),
    currency: z.string().describe('Currency code'),
    accountName: z.string().describe('Name of the account')
});

export const actionViewSchema = actionSummarySchema.extend({
    always: z
        .boolean()
        .nullable()
        .describe('Categorize cards: whether the assistant proposed the "always to this category" rule; null for other actions'),
    candidates: z.array(actionCandidateSchema).describe('Transactions the person can pick from; empty for actions that need no choice'),
    importPreview: z
        .record(z.string(), z.unknown())
        .nullable()
        .describe(
            'Import cards only: the preview of the file, in the shape of the response of POST /investment-imports/preview. Null for other actions and when the preview expired: the card asks for the file again'
        )
});

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
            access: accessSchema,
            notice: z.string().nullable().describe('Investment notice line, when the answer needs one'),
            action: actionSummarySchema
                .nullable()
                .describe('Pending action the answer proposes, waiting for the confirmation of the person')
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
                access: accessSchema,
                sentAvailable: z.boolean().describe('The figures sent to the language model are still stored'),
                notice: z.string().nullable().describe('Investment notice line, when the answer needs one'),
                action: actionSummarySchema.nullable().describe('Pending action the message proposes'),
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
export type ActionSummaryView = z.infer<typeof actionSummarySchema>;
export type ActionView = z.infer<typeof actionViewSchema>;
export type ConfirmActionBody = z.infer<typeof confirmActionBodySchema>;

export class SendTurnBodyDto extends createZodDto(sendTurnBodySchema) {}
export class TurnIdParamsDto extends createZodDto(turnIdParamsSchema) {}
export class ConversationIdParamsDto extends createZodDto(conversationIdParamsSchema) {}
export class ActionIdParamsDto extends createZodDto(actionIdParamsSchema) {}
export class ConfirmActionBodyDto extends createZodDto(confirmActionBodySchema) {}
export class FeedbackBodyDto extends createZodDto(feedbackBodySchema) {}
