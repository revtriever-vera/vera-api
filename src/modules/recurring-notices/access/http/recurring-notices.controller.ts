import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { RecurringNoticePrefsApplication } from '../../application/recurring-notice-prefs.application';
import {
    NoticeBeforeListView,
    NoticeBeforeParamsDto,
    NoticeBeforeView,
    noticeBeforeListSchema,
    noticeBeforeSchema,
    UpdateNoticeBeforeDto,
    updateNoticeBeforeSchema
} from '../../validation/recurring-notices.schemas';

const ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Series id' };
const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
const NOT_FOUND_EXAMPLE: Record<string, unknown> = {
    type: 'recurring_notices.series_not_found',
    title: 'NoticeSeriesNotFoundError',
    status: 404
};

@ApiTags('recurring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('spending/recurring')
export class RecurringNoticesController {
    public constructor(private readonly prefs: RecurringNoticePrefsApplication) {}

    @Get('notice-before')
    @ApiOperation({
        summary: 'Series with the day-before e-mail turned on by the signed-in person',
        description:
            'The "Avisar antes" choice is personal: each person turns it on series by series, and it works for any role, including viewer.'
    })
    @ApiZodResponse({ status: 200, description: 'Ids of the series with the day-before e-mail on', schema: noticeBeforeListSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async list(): Promise<NoticeBeforeListView> {
        return this.prefs.list();
    }

    @Put(':id/notice-before')
    @RequiresRole('viewer')
    @ApiOperation({
        summary: 'Turn the day-before e-mail of a series on or off for the signed-in person',
        description:
            'At 09:00 in the company time zone on the day before each charge, the person gets an e-mail with the merchant and the amount. ' +
            'Only confirmed series can be turned on. Turning off a series that was never on changes nothing. Idempotent.'
    })
    @ApiParam(ID_PARAM)
    @ApiZodBody(updateNoticeBeforeSchema)
    @ApiZodResponse({ status: 200, description: 'The choice after the change', schema: noticeBeforeSchema })
    @ApiProblemResponse({ status: 400, description: 'Invalid payload (zod validation details in meta.errors)', example: INVALID_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 404,
        description: 'The series does not exist or is not confirmed (recurring_notices.series_not_found)',
        example: NOT_FOUND_EXAMPLE
    })
    public async update(@Param() params: NoticeBeforeParamsDto, @Body() body: UpdateNoticeBeforeDto): Promise<NoticeBeforeView> {
        return this.prefs.set(params.id, body.enabled);
    }
}
