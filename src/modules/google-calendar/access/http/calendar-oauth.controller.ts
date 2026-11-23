import { Controller, Get, Header, Query, Redirect, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { PremiumGuard } from '../../../plans/services/premium.guard';
import { RequiresFeature } from '../../../plans/services/requires-feature.decorator';
import { CalendarOauthApplication } from '../../application/calendar-oauth.application';
import { CallbackQueryDto, StartResponse, startResponseSchema } from '../../validation/calendar.schemas';

const NO_STORE: string = 'no-store';

const START_EXAMPLE: StartResponse = {
    url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123.apps.googleusercontent.com&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events&state=opaque'
};

@Controller()
export class CalendarOauthController {
    public constructor(private readonly oauth: CalendarOauthApplication) {}

    @Get('calendar/google/start')
    @UseGuards(JwtAuthGuard, RolesGuard, PremiumGuard)
    @RequiresRole('viewer')
    @RequiresFeature('calendar')
    @ApiTags('calendar')
    @ApiBearerAuth()
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Start the Google Calendar authorization of the signed-in person',
        description:
            'Issues an encrypted, single-use state (valid for ten minutes) bound to the person and the account, plus a PKCE challenge, ' +
            'and returns the Google consent URL. The web app redirects the browser to it. Each member connects their own calendar.'
    })
    @ApiZodResponse({ status: 200, description: 'Google consent URL', schema: startResponseSchema, example: START_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 402,
        description: 'The plan does not include the feature (billing.premium_required)',
        example: { type: 'billing.premium_required', title: 'PremiumRequiredError', status: 402, meta: { feature: 'calendar' } }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'Google Calendar is not configured (billing.feature_disabled or calendar.provider_disabled)',
        example: { type: 'calendar.provider_disabled', title: 'CalendarProviderDisabledError', status: 503 }
    })
    public async start(): Promise<StartResponse> {
        return this.oauth.start();
    }

    @Get('calendar/google/callback')
    @Redirect()
    @Header('Cache-Control', NO_STORE)
    @ApiExcludeEndpoint()
    public async callback(@Query() query: CallbackQueryDto): Promise<{ url: string }> {
        return { url: await this.oauth.callback(query) };
    }

    @Get('google/callback')
    @Redirect()
    @Header('Cache-Control', NO_STORE)
    @ApiExcludeEndpoint()
    public async selfHostedCallback(@Query() query: CallbackQueryDto): Promise<{ url: string }> {
        return { url: await this.oauth.callback(query) };
    }
}
