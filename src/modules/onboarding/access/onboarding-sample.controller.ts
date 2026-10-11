import { Controller, Delete, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../identity/services/jwt-auth.guard';
import { OnboardingSampleApplication } from '../application/onboarding-sample.application';
import { OnboardingStateView } from '../application/onboarding-state.view';
import { onboardingStateSchema } from '../validation/onboarding.schema';

@ApiTags('onboarding')
@Controller('onboarding/sample')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingSampleController {
    public constructor(private readonly sample: OnboardingSampleApplication) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Load sample data',
        description:
            'Asks every module that registered sample data to seed it, all in one transaction. Areas that already hold real data are skipped. Closes the onboarding when it was still open.'
    })
    @ApiZodResponse({ status: 200, description: 'Updated onboarding state', schema: onboardingStateSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    @ApiProblemResponse({ status: 409, description: 'No module registered sample data (onboarding.sample_unavailable)' })
    @ApiProblemResponse({ status: 429, description: 'Too many attempts (core.too_many_attempts)' })
    @ApiProblemResponse({ status: 500, description: 'A module failed and everything was rolled back (onboarding.sample_failed)' })
    public async load(): Promise<OnboardingStateView> {
        return this.sample.load();
    }

    @Delete()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Remove sample data',
        description: 'Removes only the rows marked as sample from every module. Safe to call with no sample data loaded.'
    })
    @ApiZodResponse({ status: 200, description: 'Updated onboarding state', schema: onboardingStateSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    @ApiProblemResponse({ status: 500, description: 'A module failed and nothing was removed (onboarding.sample_failed)' })
    public async clear(): Promise<OnboardingStateView> {
        return this.sample.clear();
    }
}
