import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { PlatformOnly } from '../../../identity/services/platform-only.decorator';
import { SignupLinksAdminApplication } from '../../application/signup-links-admin.application';
import {
    CreateSignupLinkDto,
    createSignupLinkSchema,
    SignupLinkIdParamsDto,
    SignupLinkListView,
    signupLinkListSchema,
    SignupLinkView,
    signupLinkSchema,
    UpdateSignupLinkDto,
    updateSignupLinkSchema
} from '../../validation/signup-links.schemas';

const UNAUTHORIZED: { type: string; title: string; status: number } = {
    type: 'identity.unauthorized',
    title: 'UnauthorizedError',
    status: 401
};
const NOT_PLATFORM: { type: string; title: string; status: number } = {
    type: 'identity.platform_only',
    title: 'PlatformOnlyError',
    status: 403
};
const SELF_HOSTED: { type: string; title: string; status: number } = {
    type: 'identity.platform_disabled',
    title: 'PlatformDisabledError',
    status: 404
};

@ApiTags('platform')
@PlatformOnly()
@Controller('platform/signup-links')
export class PlatformSignupLinksController {
    public constructor(private readonly links: SignupLinksAdminApplication) {}

    @Post()
    @ApiOperation({
        summary: 'Create a signup link',
        description:
            'Creates a link with a label, a validity, a redemption limit and an offer: a trial (none, with card or without card) ' +
            'a discount scale by paid cycle and the days the offer stays usable after a redemption (30 by default). A `no_card` trial requires both a limit and a validity of at most 90 days. ' +
            'Records `signup_link.created` in the audit trail in the same transaction.'
    })
    @ApiZodBody(createSignupLinkSchema)
    @ApiZodResponse({ status: 201, description: 'The link, with its token and URL', schema: signupLinkSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({
        status: 403,
        description: 'Not a person of the platform company (identity.platform_only)',
        example: NOT_PLATFORM
    })
    @ApiProblemResponse({ status: 404, description: 'Self-hosted deployment (identity.platform_disabled)', example: SELF_HOSTED })
    @ApiProblemResponse({
        status: 422,
        description: 'The offer breaks a rule of the platform (signup_links.invalid_offer)',
        example: {
            type: 'signup_links.invalid_offer',
            title: 'SignupLinkInvalidOfferError',
            status: 422,
            meta: { reason: 'no_card_requires_expiry' }
        }
    })
    public async create(@Body() body: CreateSignupLinkDto): Promise<SignupLinkView> {
        return this.links.create(body);
    }

    @Patch(':id')
    @ApiOperation({
        summary: 'Edit a signup link',
        description:
            'Changes the label, the trial, the discount scale, the redemption limit, the validity of the link and the days the offer stays usable after a redemption. ' +
            'Every field is optional; what is omitted stays. The merged offer goes through the same rules as the creation (a `no_card` trial requires a limit and a validity of at most 90 days). ' +
            'The change applies to new redemptions and to redeemed offers that were not applied yet and have not expired; a subscription that already recorded its scale keeps it, and a started no-card trial keeps its terms. ' +
            'Records `signup_link.updated` in the audit trail, with the offer before and after, in the same transaction; a request that changes nothing leaves no entry.'
    })
    @ApiParam({ name: 'id', format: 'uuid', description: 'Signup link id' })
    @ApiZodBody(updateSignupLinkSchema)
    @ApiZodResponse({ status: 200, description: 'The link after the change', schema: signupLinkSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({
        status: 403,
        description: 'Not a person of the platform company (identity.platform_only)',
        example: NOT_PLATFORM
    })
    @ApiProblemResponse({
        status: 404,
        description: 'Self-hosted deployment (identity.platform_disabled) or no link with this id (signup_links.not_found)',
        example: { type: 'signup_links.not_found', title: 'SignupLinkNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'The link is revoked and cannot be edited (signup_links.revoked)',
        example: { type: 'signup_links.revoked', title: 'SignupLinkRevokedError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'The resulting offer breaks a rule of the platform (signup_links.invalid_offer)',
        example: {
            type: 'signup_links.invalid_offer',
            title: 'SignupLinkInvalidOfferError',
            status: 422,
            meta: { reason: 'no_card_requires_expiry' }
        }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    public async update(@Param() params: SignupLinkIdParamsDto, @Body() body: UpdateSignupLinkDto): Promise<SignupLinkView> {
        return this.links.update(params.id, body);
    }

    @Get()
    @ApiOperation({
        summary: 'List the signup links',
        description:
            'The most recent links, newest first, with status, uses, trials started and subscriptions. It holds no customer data, so it leaves no audit entry.'
    })
    @ApiZodResponse({ status: 200, description: 'The links', schema: signupLinkListSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({
        status: 403,
        description: 'Not a person of the platform company (identity.platform_only)',
        example: NOT_PLATFORM
    })
    @ApiProblemResponse({ status: 404, description: 'Self-hosted deployment (identity.platform_disabled)', example: SELF_HOSTED })
    public async list(): Promise<SignupLinkListView> {
        return this.links.list();
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Revoke a signup link',
        description:
            'Stops the link from accepting new redemptions. Whoever already redeemed keeps the offer. Revoking a revoked link changes nothing. ' +
            'Records `signup_link.revoked` in the audit trail in the same transaction.'
    })
    @ApiParam({ name: 'id', format: 'uuid', description: 'Signup link id' })
    @ApiNoContentResponse({ description: 'Revoked' })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({
        status: 403,
        description: 'Not a person of the platform company (identity.platform_only)',
        example: NOT_PLATFORM
    })
    @ApiProblemResponse({
        status: 404,
        description: 'Self-hosted deployment (identity.platform_disabled) or no link with this id (signup_links.not_found)',
        example: { type: 'signup_links.not_found', title: 'SignupLinkNotFoundError', status: 404 }
    })
    public async revoke(@Param() params: SignupLinkIdParamsDto): Promise<void> {
        await this.links.revoke(params.id);
    }
}
