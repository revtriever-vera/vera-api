import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
    signupLinkSchema
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
            'and a discount scale by paid cycle. A `no_card` trial requires both a limit and a validity of at most 90 days. ' +
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
