import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiParamOptions, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { FixedIncomePreviewApplication } from '../../application/fixed-income-preview.application';
import { FixedIncomeTitleApplication } from '../../application/fixed-income-title.application';
import { FixedIncomeValuation } from '../../domain/curve/curve.types';
import { FixedIncomeTitleView } from '../../domain/fixed-income.types';
import {
    CreateFixedIncomeTitleDto,
    createFixedIncomeTitleSchema,
    fixedIncomeTitleViewSchema,
    PreviewFixedIncomeDto,
    previewFixedIncomeSchema,
    TitleIdParamsDto,
    UpdateFixedIncomeTitleDto,
    updateFixedIncomeTitleSchema,
    valuationSchema
} from '../../validation/fixed-income.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const INVALID: string = 'Invalid payload (zod validation details in meta.errors)';
const NOT_FOUND: string = 'The security does not exist in this company (fixed_income.title_not_found)';
const OUT_OF_RANGE: string = 'The application date is before 2010-01-01 or in the future (fixed_income.applied_date_out_of_range)';
const INVALID_TERMS: string =
    'The terms contradict each other: USD without prefixed, maturity not after application, term over 50 years or rate out of range (fixed_income.invalid_terms)';
const TITLE_ID_PARAM: ApiParamOptions = { name: 'id', format: 'uuid', description: 'Fixed income security id' };

@ApiTags('fixed-income')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fixed-income')
export class FixedIncomeController {
    public constructor(
        private readonly titles: FixedIncomeTitleApplication,
        private readonly previews: FixedIncomePreviewApplication
    ) {}

    @Post('titles')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Register a fixed income security',
        description:
            'Registers a private fixed income security by its contract terms and returns its value today, accrued on the curve with the ' +
            'Brazilian central bank series (CDI daily, IPCA monthly; prefixed by its rate). The class is assigned in the same transaction: ' +
            'the sent `classId` or the one suggested by the indexer. Securities are never deduplicated. A company holds at most 200.'
    })
    @ApiZodBody(createFixedIncomeTitleSchema)
    @ApiZodResponse({ status: 201, description: 'Security registered, with its valuation today', schema: fixedIncomeTitleViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: 'The sent classId does not exist in this company (allocation.class_not_found)' })
    @ApiProblemResponse({
        status: 422,
        description: `${OUT_OF_RANGE}; ${INVALID_TERMS}; or the company reached 200 securities (fixed_income.limit_reached)`
    })
    public async create(@Body() body: CreateFixedIncomeTitleDto): Promise<FixedIncomeTitleView> {
        return this.titles.create(body);
    }

    @Get('titles/:id')
    @ApiOperation({
        summary: 'Read a fixed income security',
        description:
            'Returns the security with its valuation today. `valuation.estimated` flags projected business days or an unpublished IPCA; ' +
            '`valuation.status = index_data_missing` means the series do not cover the period and the value is the applied amount. ' +
            'The estimated net value is detail only and never part of the net worth total.'
    })
    @ApiParam(TITLE_ID_PARAM)
    @ApiZodResponse({ status: 200, description: 'Security with its valuation today', schema: fixedIncomeTitleViewSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    public async get(@Param() params: TitleIdParamsDto): Promise<FixedIncomeTitleView> {
        return this.titles.get(params.id);
    }

    @Patch('titles/:id')
    @ApiOperation({
        summary: 'Edit a fixed income security',
        description:
            'Changes any term of the security; the merged terms are validated again and the valuation is recalculated. ' +
            'The class is changed through the allocation assignments, not here.'
    })
    @ApiParam(TITLE_ID_PARAM)
    @ApiZodBody(updateFixedIncomeTitleSchema)
    @ApiZodResponse({ status: 200, description: 'Security after the change, with its valuation today', schema: fixedIncomeTitleViewSchema })
    @ApiProblemResponse({ status: 400, description: INVALID })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    @ApiProblemResponse({ status: 422, description: `${OUT_OF_RANGE}; ${INVALID_TERMS}` })
    public async update(@Param() params: TitleIdParamsDto, @Body() body: UpdateFixedIncomeTitleDto): Promise<FixedIncomeTitleView> {
        return this.titles.update(params.id, body);
    }

    @Delete('titles/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Remove a fixed income security',
        description: 'Soft deletes the security and releases its class assignment.'
    })
    @ApiParam(TITLE_ID_PARAM)
    @ApiNoContentResponse({ description: 'Security removed' })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    public async remove(@Param() params: TitleIdParamsDto): Promise<void> {
        await this.titles.remove(params.id);
    }

    @Post('preview')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Estimate the value of a security without saving it',
        description:
            'Calculates the valuation today for the given terms with the same engine as the registration, and stores nothing. ' +
            'Limited to 120 calls per minute per company.'
    })
    @ApiZodBody(previewFixedIncomeSchema)
    @ApiZodResponse({ status: 200, description: 'Valuation today of the given terms', schema: valuationSchema })
    @ApiProblemResponse({ status: 400, description: INVALID })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 422, description: `${OUT_OF_RANGE}; ${INVALID_TERMS}` })
    @ApiProblemResponse({ status: 429, description: 'More than 120 previews in a minute (core.too_many_attempts)' })
    public async preview(@Body() body: PreviewFixedIncomeDto): Promise<FixedIncomeValuation> {
        return this.previews.preview(body);
    }
}
