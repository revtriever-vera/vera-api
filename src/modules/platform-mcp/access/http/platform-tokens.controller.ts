import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { PlatformOnly } from '../../../identity/services/platform-only.decorator';
import { PlatformTokensApplication } from '../../application/platform-tokens.application';
import {
    CreatedPlatformTokenView,
    createdPlatformTokenSchema,
    CreatePlatformTokenDto,
    createPlatformTokenSchema,
    PlatformTokenIdParamsDto,
    PlatformTokenListView,
    platformTokenListSchema
} from '../../validation/platform-tokens.schemas';

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
@Controller('platform/tokens')
export class PlatformTokensController {
    public constructor(private readonly tokens: PlatformTokensApplication) {}

    @Post()
    @ApiOperation({
        summary: 'Create a platform token',
        description:
            'Creates a token for the MCP server (`/mcp`). The token comes back once, in this response; only its hash is kept. ' +
            'It lasts 90 days by default and at most 365. Only a session of the platform company can create one (the sign-in already asked for the second factor); ' +
            'a platform token cannot create or revoke tokens. Records `platform_token.created` in the audit trail in the same transaction.'
    })
    @ApiZodBody(createPlatformTokenSchema)
    @ApiZodResponse({ status: 201, description: 'The token, shown only now', schema: createdPlatformTokenSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({ status: 403, description: 'Not of the platform company (identity.platform_only)', example: NOT_PLATFORM })
    @ApiProblemResponse({ status: 404, description: 'Self-hosted deployment (identity.platform_disabled)', example: SELF_HOSTED })
    public async create(@Body() body: CreatePlatformTokenDto): Promise<CreatedPlatformTokenView> {
        return this.tokens.create(body);
    }

    @Get()
    @ApiOperation({
        summary: 'List the platform tokens',
        description: 'Newest first, with name, last characters, expiry, last use and revocation. The token itself is never returned.'
    })
    @ApiZodResponse({ status: 200, description: 'The tokens', schema: platformTokenListSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({ status: 403, description: 'Not of the platform company (identity.platform_only)', example: NOT_PLATFORM })
    @ApiProblemResponse({ status: 404, description: 'Self-hosted deployment (identity.platform_disabled)', example: SELF_HOSTED })
    public async list(): Promise<PlatformTokenListView> {
        return this.tokens.list();
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Revoke a platform token',
        description:
            'The token stops working at once. Revoking a revoked token changes nothing in the token but still records `platform_token.revoked` in the audit trail.'
    })
    @ApiParam({ name: 'id', format: 'uuid', description: 'Platform token id' })
    @ApiNoContentResponse({ description: 'Revoked' })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)', example: UNAUTHORIZED })
    @ApiProblemResponse({ status: 403, description: 'Not of the platform company (identity.platform_only)', example: NOT_PLATFORM })
    @ApiProblemResponse({
        status: 404,
        description: 'Self-hosted deployment (identity.platform_disabled) or no token with this id (identity.platform_token_not_found)',
        example: { type: 'identity.platform_token_not_found', title: 'PlatformTokenNotFoundError', status: 404 }
    })
    public async revoke(@Param() params: PlatformTokenIdParamsDto): Promise<void> {
        await this.tokens.revoke(params.id);
    }
}
