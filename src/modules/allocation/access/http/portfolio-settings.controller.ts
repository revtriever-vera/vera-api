import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { PortfolioSettingsApplication } from '../../application/portfolio-settings.application';
import { PortfolioSettingsView } from '../../domain/allocation.types';
import {
    portfolioSettingsSchema,
    UpdatePortfolioSettingsDto,
    updatePortfolioSettingsSchema
} from '../../validation/allocation-settings.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';

@ApiTags('allocation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('allocation/settings')
export class AllocationSettingsController {
    public constructor(private readonly settings: PortfolioSettingsApplication) {}

    @Get()
    @ApiOperation({
        summary: 'Read the portfolio settings',
        description:
            'Returns the base currency and the tolerance band. The first read creates the defaults: BRL and 500 (5 percentage points).'
    })
    @ApiZodResponse({ status: 200, description: 'Portfolio settings', schema: portfolioSettingsSchema })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    public async get(): Promise<PortfolioSettingsView> {
        return this.settings.get();
    }

    @Put()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Change the portfolio settings',
        description:
            'Changes the base currency and/or the tolerance band (0 to 2000 basis points). Changing the currency migrates nothing: ' +
            'every value is computed on read. A deviation with absolute value less than or equal to the tolerance counts as within the band.'
    })
    @ApiZodBody(updatePortfolioSettingsSchema)
    @ApiZodResponse({ status: 200, description: 'Portfolio settings after the change', schema: portfolioSettingsSchema })
    @ApiProblemResponse({ status: 400, description: 'Invalid payload (zod validation details in meta.errors)' })
    @ApiProblemResponse({ status: 401, description: UNAUTHORIZED })
    public async update(@Body() body: UpdatePortfolioSettingsDto): Promise<PortfolioSettingsView> {
        return this.settings.update(body);
    }
}
