import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
    MAX_SCRIPT_TEXT_CHARS,
    SCRIPT_ACTION_TYPES,
    SCRIPT_CARD_TYPES,
    SCRIPT_ROLES,
    SCRIPT_STATUSES,
    SCRIPT_VERSION,
    SIMPLE_ACTION_TYPES
} from '../domain/script/script.types';

const moduleFlagsSchema = z.object({
    portfolio: z.boolean().describe('Investments module on'),
    spending: z.boolean().describe('Spending module on')
});

export const scriptActionSchema = z.union([
    z.object({
        type: z.literal('CHOOSE_MODULES'),
        portfolio: z.boolean(),
        spending: z.boolean(),
        typed: z.string().optional()
    }),
    z.object({ type: z.literal('TEXT'), text: z.string() }),
    z.object({ type: z.enum(SIMPLE_ACTION_TYPES) })
]);

const chipSchema = z.object({
    id: z.string().describe('Stable id of the button, such as `modules.portfolio`'),
    label: z.string().describe('Text of the button'),
    quiet: z.boolean().optional().describe('True for the secondary option, drawn with less weight'),
    action: scriptActionSchema.describe('Body to send to POST /onboarding/conversation/actions when the button is pressed')
});

const cardSchema = z
    .object({ type: z.enum(SCRIPT_CARD_TYPES).describe('Which card the front draws under the message') })
    .passthrough()
    .describe('Card drawn under the message; the fields besides `type` depend on the card');

export const storedPayloadSchema = z.object({
    chips: z.array(chipSchema).optional(),
    card: cardSchema.optional()
});

const pendingSchema = z.object({
    key: z.string().describe('Stable id of the pending item, such as `setup.sources`'),
    label: z.string().describe('Name of the pending item, as shown on the dashboard card')
});

export const storedScriptStateSchema = z.object({
    version: z.literal(SCRIPT_VERSION),
    status: z.nativeEnum(SCRIPT_STATUSES),
    step: z.string(),
    plan: z.array(z.string()),
    chosen: z.boolean(),
    modules: moduleFlagsSchema,
    pending: z.array(pendingSchema),
    offered: z.array(chipSchema).nullable()
});

export const conversationActionBodySchema = z
    .object({
        type: z
            .enum(SCRIPT_ACTION_TYPES)
            .describe('The action, as sent by the button the person pressed. An action that does not fit the current step answers 409'),
        portfolio: z.boolean().optional().describe('CHOOSE_MODULES only: turn the investments module on'),
        spending: z.boolean().optional().describe('CHOOSE_MODULES only: turn the spending module on'),
        text: z
            .string()
            .trim()
            .min(1)
            .max(MAX_SCRIPT_TEXT_CHARS)
            .optional()
            .describe('TEXT only: what the person typed, up to 1000 characters')
    })
    .superRefine((body: { type: string; portfolio?: boolean; spending?: boolean; text?: string }, ctx: z.RefinementCtx): void => {
        if (body.type === 'CHOOSE_MODULES' && body.portfolio !== true && body.spending !== true) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['portfolio'], message: 'CHOOSE_MODULES needs at least one module on' });
        }
        if (body.type === 'TEXT' && body.text === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['text'], message: 'TEXT needs the text' });
        }
    });

export class ConversationActionDto extends createZodDto(conversationActionBodySchema) {}

export type ConversationActionBody = z.infer<typeof conversationActionBodySchema>;

const messageSchema = z.object({
    id: z.string().uuid().describe('Message id'),
    role: z
        .nativeEnum(SCRIPT_ROLES)
        .describe('Who wrote it: Vera, the person, or a system note about something that happened outside the chat'),
    text: z.string().describe('Text of the message; paragraphs are separated by a blank line'),
    createdAt: z.string().datetime().describe('When it was written (ISO 8601)'),
    payload: z
        .object({
            chips: z.array(chipSchema).optional().describe('Answer buttons under the message'),
            card: cardSchema.optional(),
            open: z.boolean().describe('True only on the last message, while its buttons or card can still be used')
        })
        .optional()
        .describe('Present on the messages of the script; absent on free questions')
});

export const onboardingConversationSchema = z.object({
    conversationId: z.string().uuid().describe('The onboarding conversation, one per account'),
    status: z
        .nativeEnum(SCRIPT_STATUSES)
        .describe('`active` while the script runs, `paused` after "Continuar depois", `done` once concluded'),
    step: z.string().describe('Current step of the script, such as `modules`, `explain` or `done`'),
    remainingSteps: z.number().int().describe('Steps still ahead, for the "Continuar configuração" card'),
    modules: moduleFlagsSchema.describe('Modules of the account, as in GET /auth/me'),
    pending: z.array(pendingSchema).describe('What was left for later, one item per step that was not done'),
    messages: z.array(messageSchema).describe('The whole conversation, oldest first')
});

export type OnboardingConversationView = z.infer<typeof onboardingConversationSchema>;
export type ConversationMessageView = z.infer<typeof messageSchema>;
export type StoredPayload = z.infer<typeof storedPayloadSchema>;
