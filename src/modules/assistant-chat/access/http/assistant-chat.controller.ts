import { applyDecorators, Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse, ProblemDoc } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { AssistantConversationApplication } from '../../application/assistant-conversation.application';
import { AssistantTurnApplication } from '../../application/assistant-turn.application';
import { TURNS_PER_HOUR } from '../../domain/assistant-chat.types';
import {
    ActionIdParamsDto,
    ActionSummaryView,
    ActionView,
    ConfirmActionBodyDto,
    actionSummarySchema,
    actionViewSchema,
    confirmActionBodySchema,
    ConversationIdParamsDto,
    ConversationView,
    FeedbackBodyDto,
    SendTurnBodyDto,
    TurnIdParamsDto,
    TurnStartedView,
    TurnView,
    SentView,
    UsageView,
    conversationResponseSchema,
    feedbackBodySchema,
    sendTurnBodySchema,
    sentResponseSchema,
    turnResponseSchema,
    turnStartedResponseSchema
} from '../../validation/assistant-chat.schemas';

const NO_STORE: string = 'no-store';
const ONE_HOUR_SECONDS: number = 3600;
const RESETS_AT: string = '2026-12-01T03:00:00.000Z';
const CONVERSATION_ID: string = '0199c5a0-5d1e-7a3b-9c11-2f4e8b6a7d10';
const TURN_ID: string = '0199c5a0-5d1f-7c52-8e0a-31b7c9d4e2f6';

const USAGE_EXAMPLE: UsageView = { state: 'ok', usedBps: 1200, resetsAt: RESETS_AT };
const STARTED_EXAMPLE: TurnStartedView = { turnId: TURN_ID, conversationId: CONVERSATION_ID };
const TURN_EXAMPLE: TurnView = {
    status: 'done',
    answer: {
        text: 'Para ver os gastos do mês, abra **Gastos** no menu lateral.',
        source: 'help',
        toolsUsed: ['help_search'],
        sentAvailable: false,
        access: 'ok',
        notice: null,
        action: null
    },
    usage: USAGE_EXAMPLE
};
const SENT_EXAMPLE: SentView = {
    sent: [
        {
            tool: 'portfolio_overview',
            payload: {
                moeda_base: 'BRL',
                total: 'R$ 120.000',
                carteira_pct: [{ chave: 'rf_pos', atual: '40%', meta: '35%', situacao: 'acima' }]
            }
        }
    ]
};
const CONVERSATION_EXAMPLE: ConversationView = {
    conversationId: CONVERSATION_ID,
    messages: [
        {
            id: '0199c5a0-5d1e-7a3b-9c11-2f4e8b6a7d11',
            role: 'person',
            text: 'Onde vejo meus gastos?',
            status: 'done',
            toolsUsed: [],
            access: 'ok',
            sentAvailable: false,
            notice: null,
            action: null,
            createdAt: '2026-11-25T12:00:00.000Z'
        },
        {
            id: TURN_ID,
            role: 'vera',
            text: 'Para ver os gastos do mês, abra **Gastos** no menu lateral.',
            status: 'done',
            toolsUsed: ['help_search'],
            access: 'ok',
            sentAvailable: false,
            notice: null,
            action: null,
            createdAt: '2026-11-25T12:00:00.001Z'
        }
    ],
    usage: USAGE_EXAMPLE,
    enabled: true
};

const ACTION_ID: string = '0199c5a0-5d20-7d11-a4f3-6c2e9b1d8a05';
const ACTION_SUMMARY_EXAMPLE: ActionSummaryView = {
    id: ACTION_ID,
    tool: 'goal_create',
    summary: 'Criar o objetivo viagem: R$ 12.000 até dezembro de 2027.',
    status: 'open',
    expiresAt: '2026-11-25T12:30:00.000Z',
    resultText: null
};
const ACTION_VIEW_EXAMPLE: ActionView = { ...ACTION_SUMMARY_EXAMPLE, candidates: [] };
const CONFIRMED_EXAMPLE: ActionSummaryView = {
    ...ACTION_SUMMARY_EXAMPLE,
    status: 'confirmed',
    resultText: 'Objetivo criado: viagem, R$ 12.000 até dezembro de 2027.'
};

const ACTION_NOT_FOUND: ProblemDoc = {
    status: 404,
    description: 'No such pending action for this person (assistant.action_not_found)',
    example: { type: 'assistant.action_not_found', title: 'ActionNotFoundError', status: 404 }
};
const ACTION_CONFLICT: ProblemDoc = {
    status: 409,
    description:
        'The action was already resolved (assistant.action_resolved), its window passed (assistant.action_expired) or what it refers to changed since it was proposed (assistant.confirmation_stale)',
    example: { type: 'assistant.confirmation_stale', title: 'ConfirmationStaleError', status: 409 }
};
const FORBIDDEN: ProblemDoc = {
    status: 403,
    description: 'The person has read-only access to the account (members.forbidden_role)',
    example: { type: 'members.forbidden_role', title: 'RoleForbiddenError', status: 403 }
};

const UNAUTHORIZED: ProblemDoc = {
    status: 401,
    description: 'Missing or invalid access token (identity.unauthorized)',
    example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
};
const NOT_FOUND: ProblemDoc = {
    status: 404,
    description: 'No such turn or conversation for this person, including one that belongs to someone else (assistant.turn_not_found)',
    example: { type: 'assistant.turn_not_found', title: 'TurnNotFoundError', status: 404 }
};
const INVALID: ProblemDoc = {
    status: 400,
    description: 'Invalid params or body (zod validation details in meta.errors)',
    example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
};
const CAP_REACHED: ProblemDoc = {
    status: 429,
    description:
        'The monthly usage band is used up (usage.cap_reached, with meta.resetsAt) or the hourly limit of 20 turns per person passed (core.too_many_attempts)',
    example: { type: 'usage.cap_reached', title: 'CapReachedError', status: 429, meta: { feature: 'help', resetsAt: RESETS_AT } }
};
const PROVIDER_DISABLED: ProblemDoc = {
    status: 503,
    description: 'The installation has no model credentials (ai.provider_disabled)',
    example: { type: 'ai.provider_disabled', title: 'LlmProviderDisabledError', status: 503 }
};

function problems(...docs: readonly ProblemDoc[]): MethodDecorator {
    return applyDecorators(...docs.map((doc: ProblemDoc): MethodDecorator => ApiProblemResponse(doc)));
}

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assistant')
export class AssistantChatController {
    public constructor(
        private readonly turns: AssistantTurnApplication,
        private readonly conversations: AssistantConversationApplication
    ) {}

    @Post('turns')
    @RequiresRole('viewer')
    @HttpCode(HttpStatus.ACCEPTED)
    @RateLimit({
        key: 'assistant-turn',
        limit: TURNS_PER_HOUR,
        windowSeconds: ONE_HOUR_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.userId ?? null
    })
    @ApiOperation({
        summary: 'Ask the assistant a question',
        description:
            'Stores the question and queues the answer; the answer is read from `GET /assistant/turns/{id}`. The turn is in `help` mode ' +
            '(answers from the help content) unless the plan includes the AI and the account allowed sending figures, then it is in `ai` mode. ' +
            'Refused up front, with nothing stored, when the usage band of the mode is used up. Limited to 20 turns per hour per person.'
    })
    @ApiZodBody(sendTurnBodySchema)
    @ApiZodResponse({ status: 202, description: 'Question accepted', schema: turnStartedResponseSchema, example: STARTED_EXAMPLE })
    @problems(INVALID, UNAUTHORIZED, NOT_FOUND, CAP_REACHED, PROVIDER_DISABLED)
    public async send(@Body() body: SendTurnBodyDto): Promise<TurnStartedView> {
        return this.turns.start(body);
    }

    @Get('turns/:id')
    @RequiresRole('viewer')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Read the answer of a turn',
        description: '`pending` while the answer is written, `done` with the answer, `failed` when it could not be written (ask again).'
    })
    @ApiParam({ name: 'id', description: 'Turn id' })
    @ApiZodResponse({ status: 200, description: 'The turn', schema: turnResponseSchema, example: TURN_EXAMPLE })
    @problems(INVALID, UNAUTHORIZED, NOT_FOUND)
    public async turn(@Param() params: TurnIdParamsDto): Promise<TurnView> {
        return this.turns.get(params.id);
    }

    @Get('turns/:id/sent')
    @RequiresRole('viewer')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'See what was sent to the language model in a turn',
        description:
            'The tool results of the turn, as they were serialized to the language model. Only the person who asked sees them. ' +
            'Empty for a `help` turn, and emptied for good when the person turns off the permission to send figures.'
    })
    @ApiParam({ name: 'id', description: 'Turn id' })
    @ApiZodResponse({ status: 200, description: 'What was sent', schema: sentResponseSchema, example: SENT_EXAMPLE })
    @problems(INVALID, UNAUTHORIZED, NOT_FOUND)
    public async sent(@Param() params: TurnIdParamsDto): Promise<SentView> {
        return this.turns.sent(params.id);
    }

    @Post('turns/:id/feedback')
    @RequiresRole('viewer')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Say the answer did not help',
        description: 'Only counts the signal per tool in a metric. Nothing of the question or the answer is kept or logged.'
    })
    @ApiParam({ name: 'id', description: 'Turn id' })
    @ApiZodBody(feedbackBodySchema)
    @ApiNoContentResponse({ description: 'Signal counted' })
    @problems(INVALID, UNAUTHORIZED, NOT_FOUND)
    public async feedback(@Param() params: TurnIdParamsDto, @Body() _body: FeedbackBodyDto): Promise<void> {
        await this.turns.feedback(params.id);
    }

    @Get('actions/:id')
    @RequiresRole('viewer')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Read a pending action',
        description:
            'The action the assistant proposed, with the transactions the person can pick from when the action needs one. ' +
            'The descriptions of the transactions are served here, to the screen only: they never go to the language model.'
    })
    @ApiParam({ name: 'id', description: 'Pending action id' })
    @ApiZodResponse({ status: 200, description: 'The action', schema: actionViewSchema, example: ACTION_VIEW_EXAMPLE })
    @problems(INVALID, UNAUTHORIZED, ACTION_NOT_FOUND)
    public async action(@Param() params: ActionIdParamsDto): Promise<ActionView> {
        return this.conversations.action(params.id);
    }

    @Post('actions/:id/confirm')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Confirm a pending action',
        description:
            'Runs the action the assistant proposed, once. The code executes it, never the model. Two confirmations at the same time run it once; ' +
            'the other gets `assistant.action_resolved`. When what the action refers to changed, nothing runs (`assistant.confirmation_stale`).'
    })
    @ApiParam({ name: 'id', description: 'Pending action id' })
    @ApiZodBody(confirmActionBodySchema)
    @ApiZodResponse({
        status: 200,
        description: 'The action, confirmed, with what was done',
        schema: actionSummarySchema,
        example: CONFIRMED_EXAMPLE
    })
    @problems(INVALID, UNAUTHORIZED, FORBIDDEN, ACTION_NOT_FOUND, ACTION_CONFLICT)
    public async confirm(@Param() params: ActionIdParamsDto, @Body() body: ConfirmActionBodyDto): Promise<ActionSummaryView> {
        return this.conversations.confirmAction(params.id, body);
    }

    @Post('actions/:id/cancel')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cancel a pending action', description: 'Drops the action the assistant proposed; nothing runs.' })
    @ApiParam({ name: 'id', description: 'Pending action id' })
    @ApiZodResponse({
        status: 200,
        description: 'The action, canceled',
        schema: actionSummarySchema,
        example: { ...ACTION_SUMMARY_EXAMPLE, status: 'canceled' }
    })
    @problems(INVALID, UNAUTHORIZED, FORBIDDEN, ACTION_NOT_FOUND, ACTION_CONFLICT)
    public async cancel(@Param() params: ActionIdParamsDto): Promise<ActionSummaryView> {
        return this.conversations.cancelAction(params.id);
    }

    @Get('conversations/current')
    @RequiresRole('viewer')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'The current conversation of the person',
        description:
            'The last 20 messages of the most recent conversation, oldest first. The conversation is private to the person and is kept for 30 days.'
    })
    @ApiZodResponse({ status: 200, description: 'The conversation', schema: conversationResponseSchema, example: CONVERSATION_EXAMPLE })
    @problems(UNAUTHORIZED)
    public async current(): Promise<ConversationView> {
        return this.conversations.current();
    }

    @Delete('conversations/:id')
    @RequiresRole('viewer')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a conversation', description: 'Removes the conversation and every message in it, for good.' })
    @ApiParam({ name: 'id', description: 'Conversation id' })
    @ApiNoContentResponse({ description: 'Conversation deleted' })
    @problems(INVALID, UNAUTHORIZED, NOT_FOUND)
    public async remove(@Param() params: ConversationIdParamsDto): Promise<void> {
        await this.conversations.remove(params.id);
    }
}
