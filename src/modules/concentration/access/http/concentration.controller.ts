import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { ConcentrationApplication } from '../../application/concentration.application';
import { ConcentrationResponse, concentrationResponseSchema } from '../../validation/concentration.schemas';

@ApiTags('portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class ConcentrationController {
    public constructor(private readonly concentration: ConcentrationApplication) {}

    @Get('concentration')
    @ApiOperation({
        summary: 'Concentration of the net worth by issuer group and by sector',
        description:
            'Share of each issuer group in the net worth (top 10 and the rest), adding the fixed income securities and the assets of the ' +
            'same group, following incorporations. Positions without a single issuer fall in fixed buckets (missing_issuer, funds, crypto, ' +
            'unmapped). Also the share of each sector in the equity holdings (Brazilian stocks, US stocks, FII and REITs). Zeroed ' +
            'positions and matured securities are left out. Shares are exact: they sum to 10000 basis points.'
    })
    @ApiZodResponse({ status: 200, description: 'Concentration by issuer group and by sector', schema: concentrationResponseSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async get(): Promise<ConcentrationResponse> {
        return this.concentration.get();
    }
}
