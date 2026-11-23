import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { UsageApplication } from '../../application/usage.application';
import { Usage, usageSchema } from '../../validation/usage.schemas';

const USAGE_EXAMPLE: Usage = {
    period: '2026-10',
    state: 'warning',
    usedBps: 8500,
    resetsAt: '2026-11-01T03:00:00.000Z',
    byFeature: { ai: { usedBps: 6000 }, whatsapp: { usedBps: 2500 } },
    capMicros: null
};

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class UsageController {
    public constructor(private readonly application: UsageApplication) {}

    @Get('usage')
    @RequiresRole('viewer')
    @ApiOperation({
        summary: 'Monthly paid usage of the signed-in company',
        description:
            'Share of the monthly cap used by the whole company (all members together), total and by feature, with the state ' +
            '(ok, warning from 80%, paused at 100%) and when the month turns. Absolute values appear only in a self-hosted installation with a cap.'
    })
    @ApiZodResponse({ status: 200, description: 'Usage of the current month', schema: usageSchema, example: USAGE_EXAMPLE })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async usage(): Promise<Usage> {
        return this.application.read();
    }
}
