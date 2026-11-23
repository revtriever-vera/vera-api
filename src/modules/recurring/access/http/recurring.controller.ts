import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { RecurringOverviewApplication } from '../../application/recurring-overview.application';
import { RecurringReviewApplication } from '../../application/recurring-review.application';
import {
    AlertIdParamsDto,
    AlertSeenView,
    alertSeenSchema,
    CalendarEntryView,
    calendarQuerySchema,
    CalendarQueryDto,
    calendarSchema,
    ChargeParamsDto,
    ConfirmSeriesDto,
    ConfirmedSeriesView,
    confirmedSeriesSchema,
    confirmSeriesSchema,
    CreateSeriesDto,
    createSeriesSchema,
    OverviewView,
    overviewSchema,
    SeriesIdParamsDto,
    SeriesView,
    seriesViewSchema,
    UpdateSeriesDto,
    updateSeriesSchema
} from '../../validation/recurring.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const FORBIDDEN: string = 'The role of the person cannot change recurring series (identity.forbidden)';
const INVALID: string = 'Invalid payload (zod validation details in meta.errors)';
const NOT_FOUND: string = 'The series does not exist in this company (recurring.series_not_found)';
const WRONG_STATE: string = 'The series is not in a state that allows this action (recurring.invalid_state)';
const ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Series id' };
const TRANSACTION_PARAM: ApiParamOptions = { name: 'transactionId', format: 'uuid', description: 'Transaction id' };

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const FORBIDDEN_EXAMPLE: Record<string, unknown> = { type: 'identity.forbidden', title: 'ForbiddenError', status: 403 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
const NOT_FOUND_EXAMPLE: Record<string, unknown> = { type: 'recurring.series_not_found', title: 'SeriesNotFoundError', status: 404 };
const WRONG_STATE_EXAMPLE: Record<string, unknown> = { type: 'recurring.invalid_state', title: 'InvalidSeriesStateError', status: 409 };

@ApiTags('recurring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('spending/recurring')
export class RecurringController {
    public constructor(
        private readonly review: RecurringReviewApplication,
        private readonly overview: RecurringOverviewApplication
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Recurring charges: totals, lists and alerts',
        description:
            'The total per month and per year counts only the confirmed series. The suggestions come apart, with what they would add per ' +
            'month. `alerts` lists the ones not marked as seen: price increase, charge twice, same subscription on two cards, trial that ' +
            'became a charge, a stopped series that charged again, a suggestion nobody reviewed and an annual renewal in the next 30 days.'
    })
    @ApiZodResponse({ status: 200, description: 'Totals, series by situation and alerts', schema: overviewSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async getOverview(): Promise<OverviewView> {
        return this.overview.overview();
    }

    @Get('calendar')
    @ApiOperation({
        summary: 'Expected charges of the next days',
        description:
            'One line per expected charge of the confirmed and suggested series, from today in the company time zone. The date is the last ' +
            'charge plus the cadence, adjusted to the expected day. A charge that did not arrive within 4 days of its date comes as `missed`.'
    })
    @ApiZodQuery(calendarQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Expected charges, oldest first', schema: calendarSchema })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async getCalendar(@Query() query: CalendarQueryDto): Promise<CalendarEntryView[]> {
        return this.overview.calendar(query.days);
    }

    @Post('alerts/:id/seen')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Mark an alert as seen ("Visto")',
        description: 'The alert stops showing in the list. Only the stored alerts can be cleared: the ones with `canMarkSeen` true.'
    })
    @ApiParam({ name: 'id', format: 'uuid', description: 'Alert id' })
    @ApiZodResponse({ status: 200, description: 'The alert was marked as seen', schema: alertSeenSchema })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description: 'The alert does not exist in this company (recurring.alert_not_found)',
        example: { type: 'recurring.alert_not_found', title: 'AlertNotFoundError', status: 404 }
    })
    public async markAlertSeen(@Param() params: AlertIdParamsDto): Promise<AlertSeenView> {
        return this.review.markAlertSeen(params.id);
    }

    @Post()
    @RequiresRole('editor')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Mark a transaction as recurring',
        description:
            'Creates a confirmed series from a debit. When the Vera already detected a series that holds the transaction, that series is ' +
            'confirmed instead. The cadence comes from the similar charges, or is monthly when there is nothing to compare.'
    })
    @ApiZodBody(createSeriesSchema)
    @ApiZodResponse({ status: 201, description: 'Confirmed series', schema: seriesViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description: 'The transaction does not exist (recurring.transaction_not_found)',
        example: { type: 'recurring.transaction_not_found', title: 'RecurrenceTransactionNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 422,
        description:
            'The transaction is not a debit in BRL (recurring.transaction_not_eligible) or the limit was reached (recurring.limit_reached)',
        example: { type: 'recurring.transaction_not_eligible', title: 'RecurrenceNotEligibleError', status: 422 }
    })
    public async create(@Body() body: CreateSeriesDto): Promise<SeriesView> {
        return this.review.createFromTransaction(body.fromTransactionId, body.name);
    }

    @Post(':id/confirm')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Confirm a suggested series',
        description:
            'Confirms the suggestion with the name, cadence, day and type the person chose. With `createRule` the Vera saves an "always to this ' +
            'merchant" rule for `categoryId` and recategorizes the past charges. The category of a charge the person set is never changed: ' +
            'when one is there, no rule is saved and `categoryRule.created` is false.'
    })
    @ApiParam(ID_PARAM)
    @ApiZodBody(confirmSeriesSchema)
    @ApiZodResponse({ status: 200, description: 'Confirmed series and what happened to the category', schema: confirmedSeriesSchema })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({ status: 409, description: WRONG_STATE, example: WRONG_STATE_EXAMPLE })
    @ApiProblemResponse({
        status: 422,
        description: 'The category is not an expense category (recurring.category_kind_mismatch)',
        example: { type: 'recurring.category_kind_mismatch', title: 'RecurringCategoryKindError', status: 422 }
    })
    public async confirm(@Param() params: SeriesIdParamsDto, @Body() body: ConfirmSeriesDto): Promise<ConfirmedSeriesView> {
        return this.review.confirm(params.id, body);
    }

    @Post(':id/dismiss')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Say "not recurring"',
        description:
            'Dismisses the series and remembers the merchant and the value range, so the Vera does not suggest it again. `restore` undoes it.'
    })
    @ApiParam(ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'Dismissed series', schema: seriesViewSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({ status: 409, description: WRONG_STATE, example: WRONG_STATE_EXAMPLE })
    public async dismiss(@Param() params: SeriesIdParamsDto): Promise<SeriesView> {
        return this.review.dismiss(params.id);
    }

    @Post(':id/restore')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Undo a dismissal or a stop',
        description: 'A dismissed series goes back to suggested and its suppression is lifted. A stopped series goes back to confirmed.'
    })
    @ApiParam(ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'Restored series', schema: seriesViewSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({ status: 409, description: WRONG_STATE, example: WRONG_STATE_EXAMPLE })
    public async restore(@Param() params: SeriesIdParamsDto): Promise<SeriesView> {
        return this.review.restore(params.id);
    }

    @Post(':id/snooze')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Hide a suggestion for 30 days ("Agora não")',
        description: 'Sets `snoozedUntil` 30 days after today in the company time zone.'
    })
    @ApiParam(ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'Snoozed series', schema: seriesViewSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({ status: 409, description: WRONG_STATE, example: WRONG_STATE_EXAMPLE })
    public async snooze(@Param() params: SeriesIdParamsDto): Promise<SeriesView> {
        return this.review.snooze(params.id);
    }

    @Patch(':id')
    @RequiresRole('editor')
    @ApiOperation({
        summary: 'Edit a confirmed series',
        description:
            'Changes the name, cadence, expected day, fixed or variable value and type. What the person edits is kept: the detection only ' +
            'refreshes the amounts and the dates.'
    })
    @ApiParam(ID_PARAM)
    @ApiZodBody(updateSeriesSchema)
    @ApiZodResponse({ status: 200, description: 'Series after the change', schema: seriesViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({ status: 409, description: WRONG_STATE, example: WRONG_STATE_EXAMPLE })
    public async update(@Param() params: SeriesIdParamsDto, @Body() body: UpdateSeriesDto): Promise<SeriesView> {
        return this.review.update(params.id, body);
    }

    @Post(':id/stop')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Mark a series as stopped ("Cancelei")',
        description: 'The Vera cancels nothing: this only records that the person did.'
    })
    @ApiParam(ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'Stopped series', schema: seriesViewSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({ status: 409, description: WRONG_STATE, example: WRONG_STATE_EXAMPLE })
    public async stop(@Param() params: SeriesIdParamsDto): Promise<SeriesView> {
        return this.review.stop(params.id);
    }

    @Delete(':id/charges/:transactionId')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Take a transaction out of a series ("Não é desta assinatura")',
        description:
            'The transaction goes to the exclusion list of the series and never comes back. The series is recalculated before the answer.'
    })
    @ApiParam(ID_PARAM)
    @ApiParam(TRANSACTION_PARAM)
    @ApiNoContentResponse({ description: 'Transaction removed from the series' })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 403, description: FORBIDDEN, example: FORBIDDEN_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description:
            'The series does not exist (recurring.series_not_found) or the transaction is not one of its charges (recurring.charge_not_found)',
        example: NOT_FOUND_EXAMPLE
    })
    public async removeCharge(@Param() params: ChargeParamsDto): Promise<void> {
        await this.review.removeCharge(params.id, params.transactionId);
    }
}
