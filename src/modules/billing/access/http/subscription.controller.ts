import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { BillingMe, billingMeSchema } from '../../../plans/services/billing-me-contract';
import { SubscribeResult, SubscriptionApplication } from '../../application/subscription.application';
import { cancelResultSchema, subscribeResultSchema, SubscribeDto, subscribeSchema } from '../../validation/billing-http.schemas';

const SUBSCRIBES_PER_HOUR: number = 10;
const ONE_HOUR_SECONDS: number = 3600;

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing/subscription')
export class SubscriptionController {
    public constructor(private readonly application: SubscriptionApplication) {}

    @Post()
    @RequiresRole('owner')
    @RateLimit({
        key: 'billing-subscribe',
        limit: SUBSCRIBES_PER_HOUR,
        windowSeconds: ONE_HOUR_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Subscribe to Premium',
        description:
            'Owner only. Creates the subscription in two phases (a pending row, then the billing provider) and answers the next step: ' +
            '`card_capture` with the page where the card is saved, or `pay_invoice` for Pix. Refused when the plan is already Premium ' +
            'or the installation is self-hosted. With a redeemed card-trial offer the subscription is card only and the first charge waits ' +
            'for the end of the trial; Premium opens when the saved card is confirmed. Limited to 10 per hour per company.'
    })
    @ApiZodBody(subscribeSchema)
    @ApiZodResponse({
        status: 201,
        description: 'Next step of the checkout',
        schema: subscribeResultSchema,
        example: { next: 'card_capture', captureUrl: 'https://pay.example.com/capture/abc' }
    })
    @ApiProblemResponse({
        status: 403,
        description: 'The platform company does not subscribe to Premium (billing.platform_company)',
        example: { type: 'billing.platform_company', title: 'PlatformCompanyCannotSubscribeError', status: 403 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'Already Premium or self-hosted (billing.already_subscribed, billing.not_available)',
        example: { type: 'billing.already_subscribed', title: 'AlreadySubscribedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The redeemed offer has a card trial and the method is not card (billing.trial_requires_card)',
        example: { type: 'billing.trial_requires_card', title: 'TrialRequiresCardError', status: 422 }
    })
    @ApiProblemResponse({
        status: 502,
        description: 'The billing provider rejected the subscription (billing.engine_rejected)',
        example: { type: 'billing.engine_rejected', title: 'BillingEngineRejectedError', status: 502 }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'The billing provider is unavailable; retry (billing.provider_unavailable)',
        example: { type: 'billing.provider_unavailable', title: 'BillingEngineUnavailableError', status: 503 }
    })
    public async subscribe(@Body() body: SubscribeDto): Promise<SubscribeResult> {
        return this.application.subscribe(body.method);
    }

    @Post('cancel')
    @HttpCode(HttpStatus.OK)
    @RequiresRole('owner')
    @ApiOperation({
        summary: 'Cancel the subscription',
        description:
            'Owner only. Premium goes on until the end of the paid cycle. Within the withdrawal window of the first payment Premium ' +
            'ends at once and a manual refund request is recorded (the API does not refund). Canceled during the card trial, Premium ' +
            'goes on until the trial ends with no charge and no refund request.'
    })
    @ApiZodResponse({
        status: 200,
        description: 'Billing state after the cancellation, with `endedNow`',
        schema: billingMeSchema.extend({ endedNow: cancelResultSchema.shape.endedNow })
    })
    @ApiProblemResponse({
        status: 404,
        description: 'There is no active subscription (billing.subscription_not_found)',
        example: { type: 'billing.subscription_not_found', title: 'NoSubscriptionError', status: 404 }
    })
    public async cancel(): Promise<BillingMe & { endedNow: boolean }> {
        return this.application.cancel();
    }

    @Post('resume')
    @HttpCode(HttpStatus.OK)
    @RequiresRole('owner')
    @ApiOperation({
        summary: 'Resume a canceled subscription',
        description:
            'Owner only. Only while the paid cycle of a canceled subscription (or the card trial) is still running: creates a new ' +
            'subscription with the same method and the first charge on the day the paid cycle or the trial ends.'
    })
    @ApiZodResponse({ status: 200, description: 'Billing state after resuming', schema: billingMeSchema })
    @ApiProblemResponse({
        status: 409,
        description: 'Nothing to resume (billing.not_resumable)',
        example: { type: 'billing.not_resumable', title: 'NotResumableError', status: 409 }
    })
    public async resume(): Promise<BillingMe> {
        return this.application.resume();
    }
}
