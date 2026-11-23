import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Redirect, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { NoticePreferencesApplication } from '../../application/notice-preferences.application';
import { NoticeUnsubscribeApplication } from '../../application/notice-unsubscribe.application';
import {
    NoticePreferencesView,
    NoticeSettingView,
    noticePreferencesSchema,
    noticeSettingSchema,
    UnsubscribeParamsDto,
    UnsubscribeResult,
    unsubscribeResultSchema,
    UpdateNoticePreferenceDto,
    updateNoticePreferenceSchema
} from '../../validation/notices.schemas';

const NO_STORE: string = 'no-store';
const UNSUBSCRIBES_PER_WINDOW: number = 30;
const WINDOW_SECONDS: number = 15 * 60;

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_TOKEN_EXAMPLE: Record<string, unknown> = {
    type: 'notices.invalid_token',
    title: 'InvalidUnsubscribeTokenError',
    status: 404
};
const TOO_MANY_EXAMPLE: Record<string, unknown> = { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 };

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
    public constructor(
        private readonly preferences: NoticePreferencesApplication,
        private readonly unsubscribing: NoticeUnsubscribeApplication
    ) {}

    @Get('preferences')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @RequiresRole('viewer')
    @ApiBearerAuth()
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'E-mail notices of the signed-in person',
        description:
            'Lists every notice type the platform can send by e-mail and whether the signed-in person receives it. ' +
            'Every type is on until the person turns it off. The preference is personal and works for any role, including viewer.'
    })
    @ApiZodResponse({
        status: 200,
        description: 'One entry per notice type',
        schema: noticePreferencesSchema,
        example: { items: [{ type: 'goal_behind', enabled: true }] }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async list(): Promise<NoticePreferencesView> {
        return this.preferences.list();
    }

    @Patch('preferences')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @RequiresRole('viewer')
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Turn an e-mail notice on or off for the signed-in person',
        description: 'Changes only the signed-in person. Any role, including viewer, can change their own preference.'
    })
    @ApiZodBody(updateNoticePreferenceSchema)
    @ApiZodResponse({
        status: 200,
        description: 'The preference after the change',
        schema: noticeSettingSchema,
        example: { type: 'goal_behind', enabled: false }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'The body is not valid (validation_failed)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The notice type does not exist (notices.unknown_type)',
        example: { type: 'notices.unknown_type', title: 'UnknownNoticeTypeError', status: 422 }
    })
    public async update(@Body() body: UpdateNoticePreferenceDto): Promise<NoticeSettingView> {
        return this.preferences.update(body.type, body.enabled);
    }

    @Post('unsubscribe/:token')
    @HttpCode(HttpStatus.OK)
    @RateLimit({
        key: 'notice-unsubscribe',
        limit: UNSUBSCRIBES_PER_WINDOW,
        windowSeconds: WINDOW_SECONDS,
        identify: (subject) => subject.ip
    })
    @ApiOperation({
        summary: 'Stop an e-mail notice in one click',
        description:
            'Public, no session: the signed token in the link is the proof. Turns the notice off for the person the link was sent to. ' +
            'Idempotent. Mail clients call it with the List-Unsubscribe-Post header; the web page calls it from its confirmation button.'
    })
    @ApiZodResponse({
        status: 200,
        description: 'The notice type the person no longer receives',
        schema: unsubscribeResultSchema,
        example: { type: 'goal_behind' }
    })
    @ApiProblemResponse({ status: 404, description: 'The link is not valid (notices.invalid_token)', example: INVALID_TOKEN_EXAMPLE })
    @ApiProblemResponse({ status: 429, description: 'Too many calls from this IP (core.too_many_attempts)', example: TOO_MANY_EXAMPLE })
    public async unsubscribe(@Param() params: UnsubscribeParamsDto): Promise<UnsubscribeResult> {
        return this.unsubscribing.unsubscribe(params.token);
    }

    @Get('unsubscribe/:token')
    @Redirect()
    @Header('Cache-Control', NO_STORE)
    @RateLimit({
        key: 'notice-unsubscribe-page',
        limit: UNSUBSCRIBES_PER_WINDOW,
        windowSeconds: WINDOW_SECONDS,
        identify: (subject) => subject.ip
    })
    @ApiExcludeEndpoint()
    public confirmation(@Param() params: UnsubscribeParamsDto): { url: string } {
        return { url: this.unsubscribing.confirmationPageOf(params.token) };
    }
}
