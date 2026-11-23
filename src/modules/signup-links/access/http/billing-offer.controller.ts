import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { clientIp } from '../../../../core/http/client-ip';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { RequiresRole } from '../../../identity/services/requires-role.decorator';
import { RolesGuard } from '../../../identity/services/roles.guard';
import { OfferRedeemApplication } from '../../application/offer-redeem.application';
import { RedeemedOfferView, RedeemOfferDto, redeemedOfferSchema, redeemOfferSchema } from '../../validation/signup-links.schemas';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing/offer')
export class BillingOfferController {
    public constructor(private readonly offers: OfferRedeemApplication) {}

    @Post('redeem')
    @HttpCode(HttpStatus.OK)
    @RequiresRole('owner')
    @ApiOperation({
        summary: 'Redeem a signup link in the signed-in account',
        description:
            'For an account that already exists: it must be Free, never have paid for Premium nor had a trial, and not have redeemed another link. ' +
            'A no-card trial opens Premium right away; a card trial and the discount scale start when the owner subscribes, within 30 days. ' +
            'Trial offers need an email verified by the sign-in provider and that never redeemed a trial before. Limited per IP per day.'
    })
    @ApiZodBody(redeemOfferSchema)
    @ApiZodResponse({ status: 200, description: 'The redeemed offer', schema: redeemedOfferSchema })
    @ApiProblemResponse({
        status: 403,
        description: 'Only the owner can redeem (signup_links.not_owner)',
        example: { type: 'signup_links.not_owner', title: 'RedeemNotOwnerError', status: 403 }
    })
    @ApiProblemResponse({
        status: 404,
        description: 'No usable link with this token, or a self-hosted deployment (signup_links.not_found)',
        example: { type: 'signup_links.not_found', title: 'SignupLinkNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 409,
        description:
            'The account cannot redeem (signup_links.account_not_eligible, meta.reason: platform_account, already_redeemed, already_paid or trial_used) or the email already redeemed a trial (signup_links.email_already_used)',
        example: {
            type: 'signup_links.account_not_eligible',
            title: 'RedeemNotEligibleError',
            status: 409,
            meta: { reason: 'already_paid' }
        }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'A no-card trial needs a verified email (signup_links.email_unverified)',
        example: { type: 'signup_links.email_unverified', title: 'RedeemEmailUnverifiedError', status: 422 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many links redeemed from this IP today (signup_links.too_many_from_ip)',
        example: { type: 'signup_links.too_many_from_ip', title: 'RedeemTooManyFromIpError', status: 429 }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    public async redeem(@Body() body: RedeemOfferDto, @Req() req: Request): Promise<RedeemedOfferView> {
        return this.offers.redeem(body.token, clientIp(req) ?? null);
    }
}
