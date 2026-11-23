import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { BillingMe, billingMeSchema } from '../../../plans/services/billing-me-contract';
import { SubscriptionApplication } from '../../application/subscription.application';
import { captureSessionResultSchema } from '../../validation/billing-http.schemas';
import { CAPTURE_SESSIONS_PER_HOUR } from '../../domain/billing.types';

const ONE_HOUR_SECONDS: number = 3600;

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing/payment-method')
export class PaymentMethodController {
    public constructor(private readonly application: SubscriptionApplication) {}

    @Post('capture-session')
    @HttpCode(HttpStatus.OK)
    @RequiresRole('owner')
    @RateLimit({
        key: 'billing-capture-session',
        limit: CAPTURE_SESSIONS_PER_HOUR,
        windowSeconds: ONE_HOUR_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Open a new card capture page',
        description:
            'Owner only. Opens a new session to save a card, replacing the current one when it is saved. Limited to 5 per hour per company.'
    })
    @ApiZodResponse({
        status: 200,
        description: 'Page where the card is saved',
        schema: captureSessionResultSchema,
        example: { captureUrl: 'https://pay.example.com/capture/abc' }
    })
    @ApiProblemResponse({
        status: 404,
        description: 'There is no active subscription (billing.subscription_not_found)',
        example: { type: 'billing.subscription_not_found', title: 'NoSubscriptionError', status: 404 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many sessions in the last hour (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async captureSession(): Promise<{ captureUrl: string }> {
        return this.application.captureSession();
    }

    @Post('confirm')
    @HttpCode(HttpStatus.OK)
    @RequiresRole('owner')
    @ApiOperation({
        summary: 'Confirm the card was saved',
        description:
            'Owner only. Called when the person returns from the card page: reads the saved card (brand and last four digits) and ' +
            'asks the provider to price again the invoices that waited for the card.'
    })
    @ApiZodResponse({ status: 200, description: 'Billing state with the saved card', schema: billingMeSchema })
    @ApiProblemResponse({
        status: 404,
        description: 'There is no active subscription (billing.subscription_not_found)',
        example: { type: 'billing.subscription_not_found', title: 'NoSubscriptionError', status: 404 }
    })
    public async confirm(): Promise<BillingMe> {
        return this.application.confirmCard();
    }
}
