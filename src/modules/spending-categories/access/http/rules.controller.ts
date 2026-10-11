import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RulePreviewView, RuleApplication, RuleSavedView } from '../../application/rule.application';
import { RuleView } from '../../domain/categories.types';
import {
    CreateRuleDto,
    createRuleSchema,
    PreviewRuleDto,
    previewRuleResponseSchema,
    previewRuleSchema,
    removedSchema,
    RuleIdParamsDto,
    ruleListSchema,
    ruleSavedSchema,
    UpdateRuleDto,
    updateRuleSchema
} from '../../validation/categories.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid payload (zod validation details in meta.errors)';
const RULE_NOT_FOUND: string = 'The rule does not exist in this company (categories.rule_not_found)';
const RULE_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Rule id' };
const PREVIEWS_PER_MINUTE: number = 60;
const ONE_MINUTE_SECONDS: number = 60;

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };
const INVALID_EXAMPLE: Record<string, unknown> = { type: 'validation_failed', title: 'ZodValidationException', status: 400 };
const RULE_NOT_FOUND_EXAMPLE: Record<string, unknown> = { type: 'categories.rule_not_found', title: 'RuleNotFoundError', status: 404 };
const CATEGORY_NOT_FOUND_EXAMPLE: Record<string, unknown> = {
    type: 'categories.category_not_found',
    title: 'CategoryNotFoundError',
    status: 404
};
const CONFLICT_EXAMPLE: Record<string, unknown> = {
    type: 'categories.rule_conflict',
    title: 'RuleConflictError',
    status: 409,
    detail: 'A rule with the same match already exists.',
    meta: { ruleId: '0199c3a0-7b1e-7c52-9d0e-3f6a1b2c4d5e' }
};

const RULE_EXAMPLE: Record<string, unknown> = {
    id: '0199c3a0-7b1e-7c52-9d0e-3f6a1b2c4d5e',
    matchType: 'contains',
    label: 'padaria estrela',
    appliesTo: 'out',
    categoryId: '0199c3a0-1111-7c52-9d0e-3f6a1b2c4d5e',
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z'
};

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/rules')
export class RulesController {
    public constructor(private readonly rules: RuleApplication) {}

    @Get()
    @ApiOperation({ summary: 'List the categorization rules of the company', description: 'Newest first.' })
    @ApiZodResponse({ status: 200, description: 'Rules of the company', schema: ruleListSchema, example: { rules: [RULE_EXAMPLE] } })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    public async list(): Promise<{ rules: RuleView[] }> {
        return { rules: await this.rules.list() };
    }

    @Post('preview')
    @HttpCode(HttpStatus.OK)
    @RateLimit({
        key: 'spending-rules-preview',
        limit: PREVIEWS_PER_MINUTE,
        windowSeconds: ONE_MINUTE_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Preview how many transactions a rule would affect',
        description:
            'Normalizes the pattern and counts the matching transactions. Writes nothing. Returns 0 matches while no transaction ' +
            'driver is registered. Limited to 60 calls per minute per company.'
    })
    @ApiZodBody(previewRuleSchema)
    @ApiZodResponse({
        status: 200,
        description: 'Normalized pattern and matches',
        schema: previewRuleResponseSchema,
        example: { normalizedPattern: 'PADARIA ESTRELA', matches: 7 }
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({
        status: 422,
        description: 'The pattern is not valid once normalized (categories.invalid_rule)',
        example: { type: 'categories.invalid_rule', title: 'InvalidRuleError', status: 422 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 60 previews in a minute (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async preview(@Body() body: PreviewRuleDto): Promise<RulePreviewView> {
        return this.rules.preview(body);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Create a categorization rule',
        description:
            'Saves the rule and, with applyToPast (default true), recategorizes the matching past transactions in the same database ' +
            'transaction. Precedence between rules: counterparty, then description, then contains (longest pattern, then most recent). ' +
            'The company holds at most 500 rules.'
    })
    @ApiZodBody(createRuleSchema)
    @ApiZodResponse({
        status: 201,
        description: 'Rule created',
        schema: ruleSavedSchema,
        example: { rule: RULE_EXAMPLE, recategorized: 7 }
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description: 'The category does not exist in this company (categories.category_not_found)',
        example: CATEGORY_NOT_FOUND_EXAMPLE
    })
    @ApiProblemResponse({
        status: 409,
        description: 'A rule with the same match already exists (categories.rule_conflict, meta.ruleId)',
        example: CONFLICT_EXAMPLE
    })
    @ApiProblemResponse({
        status: 422,
        description: 'Invalid pattern (categories.invalid_rule) or 500 rules reached (categories.limit_reached)',
        example: { type: 'categories.invalid_rule', title: 'InvalidRuleError', status: 422 }
    })
    public async create(@Body() body: CreateRuleDto): Promise<RuleSavedView> {
        return this.rules.create(body);
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Change the category or the direction of a rule',
        description: 'Recategorizes the matching past transactions in the same database transaction.'
    })
    @ApiParam(RULE_ID_PARAM)
    @ApiZodBody(updateRuleSchema)
    @ApiZodResponse({
        status: 200,
        description: 'Rule updated',
        schema: ruleSavedSchema,
        example: { rule: RULE_EXAMPLE, recategorized: 7 }
    })
    @ApiProblemResponse({ status: 400, description: INVALID, example: INVALID_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({
        status: 404,
        description: 'The rule or the category does not exist (categories.rule_not_found, categories.category_not_found)',
        example: RULE_NOT_FOUND_EXAMPLE
    })
    @ApiProblemResponse({
        status: 409,
        description: 'Another rule already has this match (categories.rule_conflict, meta.ruleId)',
        example: CONFLICT_EXAMPLE
    })
    public async update(@Param() params: RuleIdParamsDto, @Body() body: UpdateRuleDto): Promise<RuleSavedView> {
        return this.rules.update(params.id, body);
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Delete a categorization rule',
        description: 'Soft delete. The transactions it categorized are recategorized by the pipeline in the same database transaction.'
    })
    @ApiParam(RULE_ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'Rule deleted', schema: removedSchema, example: { recategorized: 7 } })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED, example: UNAUTHORIZED_EXAMPLE })
    @ApiProblemResponse({ status: 404, description: RULE_NOT_FOUND, example: RULE_NOT_FOUND_EXAMPLE })
    public async remove(@Param() params: RuleIdParamsDto): Promise<{ recategorized: number }> {
        return this.rules.remove(params.id);
    }
}
