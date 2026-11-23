import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { MaturitiesApplication } from '../../application/maturities.application';
import { RealRatesApplication } from '../../application/real-rates.application';
import {
    MaturitiesQueryDto,
    MaturitiesResponse,
    maturitiesQuerySchema,
    maturitiesResponseSchema,
    RealRatesResponse,
    realRatesResponseSchema
} from '../../validation/schedule.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';

@ApiTags('portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class ScheduleController {
    public constructor(
        private readonly maturities: MaturitiesApplication,
        private readonly realRates: RealRatesApplication
    ) {}

    @Get('maturities')
    @ApiOperation({
        summary: 'Upcoming maturities with the estimated value',
        description:
            'Fixed income securities and Tesouro Direto positions that mature today or later, nearest first, with the estimated gross ' +
            'value on the maturity date (before income tax), the days to maturity, the amount to carry to the contribution suggestion ' +
            '(value rounded down to R$ 100) and the basis of the estimate. The projection holds the latest CDI and the 12-month IPCA ' +
            'constant until the maturity and counts business days on a 252-day year; it is not a guarantee. The reference rates used ' +
            'come in the response. Without the index series the rows come back estimated, with today value.'
    })
    @ApiZodQuery(maturitiesQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Upcoming maturities', schema: maturitiesResponseSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid limit (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: UNAUTHORIZED,
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async listMaturities(@Query() query: MaturitiesQueryDto): Promise<MaturitiesResponse> {
        return this.maturities.list(query.limit);
    }

    @Get('real-rates')
    @ApiOperation({
        summary: 'Real rate and purchasing power of each fixed income security',
        description:
            'For each BRL security not yet matured: the nominal yearly rate, the real rate above the 12-month IPCA, the applied amount ' +
            'corrected by the IPCA published since the application date and the purchasing power gain (value today minus the corrected ' +
            'amount). Every figure is before income tax. Rows below 3% a year of real rate are flagged.'
    })
    @ApiZodResponse({ status: 200, description: 'Real rates', schema: realRatesResponseSchema })
    @ApiProblemResponse({
        status: 401,
        description: UNAUTHORIZED,
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'There is no IPCA series with 12 consecutive months (fixed_income.index_data_missing)',
        example: { type: 'fixed_income.index_data_missing', title: 'ScheduleIndexDataMissingError', status: 503 }
    })
    public async listRealRates(): Promise<RealRatesResponse> {
        return this.realRates.list();
    }
}
