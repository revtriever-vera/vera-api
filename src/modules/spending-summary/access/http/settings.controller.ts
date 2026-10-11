import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { SettingsApplication } from '../../application/settings.application';
import { SpendingSettingsView } from '../../domain/spending-summary.types';
import { spendingSettingsSchema, UpdateSpendingSettingsDto, updateSpendingSettingsSchema } from '../../validation/spending-summary.schemas';

const UNAUTHORIZED_EXAMPLE: Record<string, unknown> = { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 };

@ApiTags('spending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spending/settings')
export class SettingsController {
    public constructor(private readonly settings: SettingsApplication) {}

    @Get()
    @ApiOperation({
        summary: 'Read the spending settings',
        description:
            'Returns the savings goal and the income source. The first read creates the defaults: 2000 bps (20%) and `transactions`.'
    })
    @ApiZodResponse({ status: 200, description: 'Spending settings', schema: spendingSettingsSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    public async get(): Promise<SpendingSettingsView> {
        return this.settings.get();
    }

    @Put()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Change the spending settings',
        description:
            'Changes the savings goal (0 to 9000 bps) and/or the income source. In `declared` mode the declared income must be greater than ' +
            'zero. The declared value is kept when the mode goes back to `transactions`. Takes effect on the next summary, with no cache.'
    })
    @ApiZodBody(updateSpendingSettingsSchema)
    @ApiZodResponse({ status: 200, description: 'Spending settings after the change', schema: spendingSettingsSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: UNAUTHORIZED_EXAMPLE
    })
    @ApiProblemResponse({
        status: 422,
        description: 'Declared mode without a declared income (summary.declared_income_required)',
        example: { type: 'summary.declared_income_required', title: 'DeclaredIncomeRequiredError', status: 422 }
    })
    public async update(@Body() body: UpdateSpendingSettingsDto): Promise<SpendingSettingsView> {
        return this.settings.update(body);
    }
}
