import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { IssuerSearchApplication } from '../../application/issuer-search.application';
import { ISSUER_SEARCH_LIMIT_PER_MINUTE, ISSUER_SEARCH_WINDOW_SECONDS } from '../../domain/issuer.types';
import {
    IssuerSearchQueryDto,
    IssuerSearchResponse,
    issuerSearchQuerySchema,
    issuerSearchResponseSchema
} from '../../validation/issuers.schemas';

@ApiTags('issuers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('issuers')
export class IssuersController {
    public constructor(private readonly search: IssuerSearchApplication) {}

    @Get()
    @RateLimit({
        key: 'issuers-search',
        limit: ISSUER_SEARCH_LIMIT_PER_MINUTE,
        windowSeconds: ISSUER_SEARCH_WINDOW_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Search the curated list of issuers',
        description:
            'Searches institutions and business groups by name, alias or group name, ignoring accents and case, and returns at most 20. ' +
            'Retired institutions only appear when the text matches their name exactly, so an old security can still be edited. ' +
            'Use `kind=bank` for CDB, LCI, LCA and LC, and `kind=company` for debenture, CRI and CRA. Limited to 120 calls per minute per company.'
    })
    @ApiZodQuery(issuerSearchQuerySchema)
    @ApiZodResponse({
        status: 200,
        description: 'Institutions ordered by relevance',
        schema: issuerSearchResponseSchema,
        example: {
            items: [
                {
                    id: 'banco-inter',
                    name: 'Banco Inter',
                    groupId: 'inter-co',
                    groupName: 'Inter&Co',
                    kind: 'bank',
                    fgcAssociated: true,
                    status: 'active'
                }
            ]
        }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid query (zod validation details in meta.errors)',
        example: {
            type: 'validation_failed',
            title: 'ZodValidationException',
            status: 400,
            detail: 'Validation failed.',
            requestId: '0199c3a0-0000-7000-8000-000000000001'
        }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 120 searches in a minute for the company (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public list(@Query() query: IssuerSearchQueryDto): IssuerSearchResponse {
        return this.search.search(query);
    }
}
