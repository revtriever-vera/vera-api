import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { PortfolioViewApplication } from '../../application/portfolio-view.application';
import {
    ClassDetailResponse,
    ClassIdParamsDto,
    classDetailResponseSchema,
    HoldingsResponse,
    holdingsResponseSchema,
    OverviewResponse,
    overviewResponseSchema
} from '../../validation/portfolio.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';
const NOT_FOUND: string = 'The class does not exist in this company (allocation.class_not_found)';

@ApiTags('portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class PortfolioController {
    public constructor(private readonly portfolio: PortfolioViewApplication) {}

    @Get('holdings')
    @ApiOperation({
        summary: 'List the holdings of the portfolio',
        description:
            'Positions and fixed income titles with the value in the base currency, where the value comes from and the quality ' +
            'of the data (missing or old quote, estimate, missing exchange rate). Nothing is stored: the value is computed on every read ' +
            'from quantity x latest quote, or from the curve for fixed income, converted by the latest PTAX. Ordered by class and value.'
    })
    @ApiZodResponse({ status: 200, description: 'Holdings of the company', schema: holdingsResponseSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    public async holdings(): Promise<HoldingsResponse> {
        return this.portfolio.holdings();
    }

    @Get('overview')
    @ApiOperation({
        summary: 'Overview of the portfolio: current versus target',
        description:
            'Net worth, exposure to the dollar, and for every class the value, share, target, deviation, status inside the tolerance ' +
            'and the gap to the target. Also returns the class with the largest deviation and counters of data quality. All values ' +
            'are integers in the minor unit of the base currency and every share is in basis points.'
    })
    @ApiZodResponse({ status: 200, description: 'Overview of the company portfolio', schema: overviewResponseSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    public async overview(): Promise<OverviewResponse> {
        return this.portfolio.overview();
    }

    @Get('classes/:classId')
    @ApiOperation({
        summary: 'Detail of one class',
        description:
            'The holdings inside the class with value, share inside the class, effective target (the stored one, or an equal split ' +
            'when none is set), deviation, status and gap. Positions with quantity zero appear with 0%.'
    })
    @ApiParam({ name: 'classId', format: 'uuid', description: 'Asset class id' })
    @ApiZodResponse({ status: 200, description: 'Class with its holdings', schema: classDetailResponseSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    @ApiProblemResponse({ status: 404, description: NOT_FOUND })
    public async classDetail(@Param() params: ClassIdParamsDto): Promise<ClassDetailResponse> {
        return this.portfolio.classDetail(params.classId);
    }
}
