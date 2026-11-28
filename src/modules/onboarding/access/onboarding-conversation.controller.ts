import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../identity/services/roles.guard';
import { OnboardingConversationApplication } from '../application/onboarding-conversation.application';
import { scriptActionOf } from '../services/script-action.mapper';
import {
    ConversationActionDto,
    conversationActionBodySchema,
    OnboardingConversationView,
    onboardingConversationSchema
} from '../validation/onboarding-conversation.schemas';

@ApiTags('onboarding')
@Controller('onboarding/conversation')
@RequiresRole('editor')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OnboardingConversationController {
    public constructor(private readonly conversation: OnboardingConversationApplication) {}

    @Get()
    @ApiOperation({
        summary: 'The onboarding conversation of the account',
        description:
            'One conversation per account, shared by every editor. The first call opens it with the welcome message and its four ' +
            'buttons; later calls return the same conversation with the whole history. The script never calls a language model.'
    })
    @ApiZodResponse({ status: 200, description: 'The conversation and where the script is', schema: onboardingConversationSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'Viewers cannot run the onboarding (members.forbidden_role)',
        example: { type: 'members.forbidden_role', title: 'RoleForbiddenError', status: 403, meta: { required: 'editor' } }
    })
    public async current(): Promise<OnboardingConversationView> {
        return this.conversation.open();
    }

    @Post('actions')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Answer the onboarding conversation',
        description:
            'Sends what a button stands for (its `action`) or a typed text (`TEXT`). The script answers, the modules chosen are saved ' +
            'on the account, and concluding stamps the onboarding as completed. Answers with the whole conversation.'
    })
    @ApiZodBody(conversationActionBodySchema)
    @ApiZodResponse({ status: 200, description: 'The conversation after the action', schema: onboardingConversationSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'Viewers cannot run the onboarding (members.forbidden_role)',
        example: { type: 'members.forbidden_role', title: 'RoleForbiddenError', status: 403, meta: { required: 'editor' } }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'The action does not fit the current step (onboarding.action_out_of_step)',
        example: {
            type: 'onboarding.action_out_of_step',
            title: 'OnboardingActionOutOfStepError',
            status: 409,
            meta: { action: 'CONFIRM_IMPORT', step: 'modules', status: 'active' }
        }
    })
    public async act(@Body() body: ConversationActionDto): Promise<OnboardingConversationView> {
        return this.conversation.act(scriptActionOf(body));
    }
}
