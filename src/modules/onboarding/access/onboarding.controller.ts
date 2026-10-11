import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../identity/services/jwt-auth.guard';
import { OnboardingStateApplication } from '../application/onboarding-state.application';
import { OnboardingStateView } from '../application/onboarding-state.view';
import { OnboardingSummaryApplication } from '../application/onboarding-summary.application';
import { OnboardingAreaSummaries } from '../services/onboarding-area.registry';
import { onboardingStateSchema, onboardingSummarySchema } from '../validation/onboarding.schema';

@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
    public constructor(
        private readonly state: OnboardingStateApplication,
        private readonly summaryApplication: OnboardingSummaryApplication
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Current onboarding state',
        description: 'Creates the company onboarding row on the first call. `status` tells the front which screen to resume.'
    })
    @ApiZodResponse({ status: 200, description: 'Onboarding state', schema: onboardingStateSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async current(): Promise<OnboardingStateView> {
        return this.state.current();
    }

    @Get('summary')
    @ApiOperation({
        summary: 'What was configured so far',
        description: 'Asks every registered module for its area summary. An area with no module, or whose module failed, is null.'
    })
    @ApiZodResponse({ status: 200, description: 'Per area summary', schema: onboardingSummarySchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async summary(): Promise<OnboardingAreaSummaries> {
        return this.summaryApplication.summary();
    }

    @Post('start')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Leave the welcome screen', description: 'Idempotent.' })
    @ApiZodResponse({ status: 200, description: 'Updated onboarding state', schema: onboardingStateSchema })
    @ApiProblemResponse({
        status: 409,
        description: 'Onboarding already closed (onboarding.already_closed)',
        example: { type: 'onboarding.already_closed', title: 'OnboardingAlreadyClosedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async start(): Promise<OnboardingStateView> {
        return this.state.start();
    }

    @Post('steps/:step/complete')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Mark a step as done',
        description: '`step` is `assets` or `banks`. Clears a previous skip of the same step. Idempotent.'
    })
    @ApiZodResponse({ status: 200, description: 'Updated onboarding state', schema: onboardingStateSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Unknown step (onboarding.unknown_step)',
        example: { type: 'onboarding.unknown_step', title: 'UnknownOnboardingStepError', status: 400 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'Onboarding already closed (onboarding.already_closed)',
        example: { type: 'onboarding.already_closed', title: 'OnboardingAlreadyClosedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async complete(@Param('step') step: string): Promise<OnboardingStateView> {
        return this.state.completeStep(step);
    }

    @Post('steps/:step/skip')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Skip a step',
        description: '`step` is `assets` or `banks`. Clears a previous completion of the same step. Idempotent.'
    })
    @ApiZodResponse({ status: 200, description: 'Updated onboarding state', schema: onboardingStateSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Unknown step (onboarding.unknown_step)',
        example: { type: 'onboarding.unknown_step', title: 'UnknownOnboardingStepError', status: 400 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'Onboarding already closed (onboarding.already_closed)',
        example: { type: 'onboarding.already_closed', title: 'OnboardingAlreadyClosedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async skip(@Param('step') step: string): Promise<OnboardingStateView> {
        return this.state.skipStep(step);
    }

    @Post('finish')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Go to the dashboard', description: 'Closes the onboarding for good. Idempotent.' })
    @ApiZodResponse({ status: 200, description: 'Updated onboarding state', schema: onboardingStateSchema })
    @ApiProblemResponse({
        status: 409,
        description: 'Onboarding was dismissed (onboarding.already_closed)',
        example: { type: 'onboarding.already_closed', title: 'OnboardingAlreadyClosedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async finish(): Promise<OnboardingStateView> {
        return this.state.finish();
    }

    @Post('dismiss')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Skip the whole setup', description: 'Closes the onboarding for good. Idempotent.' })
    @ApiZodResponse({ status: 200, description: 'Updated onboarding state', schema: onboardingStateSchema })
    @ApiProblemResponse({
        status: 409,
        description: 'Onboarding was finished (onboarding.already_closed)',
        example: { type: 'onboarding.already_closed', title: 'OnboardingAlreadyClosedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async dismiss(): Promise<OnboardingStateView> {
        return this.state.dismiss();
    }
}
