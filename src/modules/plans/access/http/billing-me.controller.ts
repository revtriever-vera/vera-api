import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { BillingMeApplication } from '../../application/billing-me.application';
import { BillingMe, billingMeSchema } from '../../validation/billing-me.schemas';

const HOSTED_EXAMPLE: BillingMe = {
    mode: 'hosted',
    plan: 'free',
    canManage: true,
    methods: ['card', 'pix'],
    priceCents: 1490,
    currency: 'BRL',
    subscription: null,
    openInvoice: null,
    trial: null,
    offer: null,
    features: { ai: 'premium_required', whatsapp: 'premium_required', calendar: 'premium_required' },
    usage: null
};

const SELF_HOSTED_EXAMPLE: BillingMe = {
    mode: 'self_hosted',
    plan: 'self_hosted',
    canManage: true,
    methods: [],
    priceCents: null,
    currency: 'BRL',
    subscription: null,
    openInvoice: null,
    trial: null,
    offer: null,
    features: { ai: 'available', whatsapp: 'disabled', calendar: 'disabled' },
    usage: {
        usedBps: 4200,
        state: 'ok',
        resetsAt: '2026-12-01T03:00:00.000Z',
        byFeature: { ai: { usedBps: 4200 }, whatsapp: { usedBps: 0 } },
        capMicros: 4000000
    }
};

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingMeController {
    public constructor(private readonly application: BillingMeApplication) {}

    @Get('me')
    @RequiresRole('viewer')
    @ApiOperation({
        summary: 'Plan, paid features and monthly usage of the signed-in company',
        description:
            'Single source of truth for the front: deployment mode, effective plan, subscription and open invoice (hosted), the ' +
            'state of each paid feature and the monthly usage. Any member can read it; `canManage` tells whether the user can change the plan.'
    })
    @ApiZodResponse({
        status: 200,
        description: 'Billing state. Hosted free example shown; the self-hosted example has plan self_hosted, no methods and no price.',
        schema: billingMeSchema,
        example: { hosted: HOSTED_EXAMPLE, selfHosted: SELF_HOSTED_EXAMPLE }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async me(): Promise<BillingMe> {
        return this.application.get();
    }
}
