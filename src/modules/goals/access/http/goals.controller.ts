import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { holderFilterOf } from '../../../../shared/holder/holder-filter';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { GoalsApplication } from '../../application/goals.application';
import {
    CreateGoalDto,
    createGoalSchema,
    EmergencySuggestion,
    EmergencySuggestionQueryDto,
    emergencySuggestionQuerySchema,
    emergencySuggestionSchema,
    GoalIdParamsDto,
    goalsListSchema,
    GoalsList,
    GoalsQueryDto,
    goalsQuerySchema,
    GoalView,
    goalViewSchema,
    UpdateGoalDto,
    updateGoalSchema
} from '../../validation/goals.schemas';

const NO_STORE: string = 'no-store';
const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid payload (zod validation details in meta.errors)';
const NOT_FOUND: string = 'The goal does not exist in this company (goals.goal_not_found)';
const GOAL_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Goal id' };

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
const NOT_FOUND_EXAMPLE: Record<string, unknown> = { type: 'goals.goal_not_found', title: 'GoalNotFoundError', status: 404 };

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goals')
export class GoalsController {
    public constructor(private readonly goals: GoalsApplication) {}

    @Get()
    @RequiresRole('viewer')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'List the goals with balance, what is missing and the monthly amount',
        description:
            "Each goal carries its balance (manual value plus the linked part of each holding at today's value, in BRL), what is missing, " +
            'the monthly amount (missing divided by the calendar months left, current month not counted, no future yield), the status ' +
            'against the reference plan and the change in the month. The totals sum the monthly amount of the goals not done. ' +
            'The holder filter narrows the list the same way it does in the portfolio.'
    })
    @ApiZodQuery(goalsQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Goals and totals', schema: goalsListSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async list(@Query() query: GoalsQueryDto): Promise<GoalsList> {
        return this.goals.list(holderFilterOf(query.holder));
    }

    @Post()
    @RequiresRole('editor')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Create a goal',
        description:
            'Creates a goal with a target and a date, linked to parts of holdings of the portfolio plus an optional manual value. ' +
            "The share of one holding summed across all goals cannot pass 100%. The reference plan starts at today's balance. " +
            'The company holds at most 20 goals and one emergency reserve per holder.'
    })
    @ApiZodBody(createGoalSchema)
    @ApiZodResponse({ status: 201, description: 'Goal created', schema: goalViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description: 'A linked holding is not in the portfolio (goals.holding_not_found) or the holder is not a person of the account',
        example: { type: 'goals.holding_not_found', title: 'GoalHoldingNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 409,
        description:
            'The shares of a holding would pass 100% (goals.holding_overallocated, meta.freeBps) or the holder already has an ' +
            'emergency reserve (goals.emergency_reserve_exists)',
        example: { type: 'goals.holding_overallocated', title: 'GoalHoldingOverallocatedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The date is not after today (goals.target_date_in_past) or the limit was reached (goals.limit_reached)',
        example: { type: 'goals.target_date_in_past', title: 'GoalTargetDateInPastError', status: 422 }
    })
    public async create(@Body() body: CreateGoalDto): Promise<GoalView> {
        return this.goals.create(body);
    }

    @Get('emergency-suggestion')
    @RequiresRole('viewer')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({
        summary: 'Suggest the emergency reserve from the spending average',
        description:
            'Returns months times the monthly average of the spending (expense categories, fixed and flexible, plus what has no category; ' +
            'transfers, card bills and investments stay out) of the up to 3 closed months before the current one, only months with ' +
            'transactions. `months` is 3, 6 (default) or 12. Without imported spending `averageMinor` and `suggestedMinor` are null and ' +
            'the person types the monthly spending. The target of a goal never changes alone: see `reserve` in the goal.'
    })
    @ApiZodQuery(emergencySuggestionQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Average and suggested reserve', schema: emergencySuggestionSchema })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async emergencySuggestion(@Query() query: EmergencySuggestionQueryDto): Promise<EmergencySuggestion> {
        return this.goals.emergencySuggestion(query.months);
    }

    @Get(':id')
    @RequiresRole('viewer')
    @Header('Cache-Control', NO_STORE)
    @ApiOperation({ summary: 'Read a goal', description: 'Returns one goal with the same figures the list shows.' })
    @ApiParam(GOAL_ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'Goal', schema: goalViewSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    public async get(@Param() params: GoalIdParamsDto): Promise<GoalView> {
        return this.goals.get(params.id);
    }

    @Patch(':id')
    @RequiresRole('editor')
    @ApiOperation({
        summary: 'Edit a goal',
        description:
            'Changes the name, the target, the date, the holder, the manual value and, when sent, replaces the links to holdings. ' +
            "Changing the target or the date restarts the reference plan from today's balance."
    })
    @ApiParam(GOAL_ID_PARAM)
    @ApiZodBody(updateGoalSchema)
    @ApiZodResponse({ status: 200, description: 'Goal after the change', schema: goalViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    @ApiProblemResponse({
        status: 409,
        description: 'The shares of a holding would pass 100% (goals.holding_overallocated) or the new holder already has a reserve',
        example: { type: 'goals.holding_overallocated', title: 'GoalHoldingOverallocatedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The new date is not after today (goals.target_date_in_past)',
        example: { type: 'goals.target_date_in_past', title: 'GoalTargetDateInPastError', status: 422 }
    })
    public async update(@Param() params: GoalIdParamsDto, @Body() body: UpdateGoalDto): Promise<GoalView> {
        return this.goals.update(params.id, body);
    }

    @Delete(':id')
    @RequiresRole('editor')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Remove a goal', description: 'Removes the goal and releases the shares it held of each holding.' })
    @ApiParam(GOAL_ID_PARAM)
    @ApiNoContentResponse({ description: 'Goal removed' })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND, example: NOT_FOUND_EXAMPLE })
    public async remove(@Param() params: GoalIdParamsDto): Promise<void> {
        await this.goals.remove(params.id);
    }
}
