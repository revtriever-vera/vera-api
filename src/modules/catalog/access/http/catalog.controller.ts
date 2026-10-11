import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { AssetSearchApplication } from '../../application/asset-search.application';
import {
    AssetItem,
    AssetSearchQueryDto,
    AssetSearchResponse,
    assetItemSchema,
    assetSearchQuerySchema,
    assetSearchResponseSchema
} from '../../validation/catalog.schemas';

const SEARCHES_PER_MINUTE: number = 60;
const ONE_MINUTE_SECONDS: number = 60;

const ITEM_EXAMPLE: AssetItem = {
    id: '0199c3a0-7b1e-7c2a-9d4e-2f6a8b1c3d5e',
    symbol: 'IVVB11',
    name: 'iShares S&P 500 FIC FI Cotas ETF',
    market: 'B3',
    kind: 'etf',
    typeGroup: 'acoes_eua',
    currency: 'BRL',
    suggestedClassKey: 'acoes_eua',
    dollarExposure: true,
    quantityDecimals: 0,
    maturityDate: null
};

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('catalog')
export class CatalogController {
    public constructor(private readonly search: AssetSearchApplication) {}

    @Get('assets')
    @RateLimit({
        key: 'catalog-search',
        limit: SEARCHES_PER_MINUTE,
        windowSeconds: ONE_MINUTE_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Search the asset catalog',
        description:
            'Lists active assets by ticker or name, ordered by relevance: exact symbol, symbol prefix, then name similarity. ' +
            'With an empty q it lists the popular assets of the group. Each asset carries the class suggested by its exposure ' +
            '(IVVB11 is acoes_eua), or null when the user must choose. Prices are not part of the catalog.'
    })
    @ApiZodQuery(assetSearchQuerySchema)
    @ApiZodResponse({
        status: 200,
        description: 'Assets ordered by relevance',
        schema: assetSearchResponseSchema,
        example: { data: [ITEM_EXAMPLE] }
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
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 60 searches in a minute for the company',
        example: {
            type: 'core.too_many_attempts',
            title: 'TooManyAttemptsError',
            status: 429,
            detail: 'Too many attempts for this key within the configured window.',
            requestId: '0199c3a0-0000-7000-8000-000000000002'
        }
    })
    public async list(@Query() query: AssetSearchQueryDto): Promise<AssetSearchResponse> {
        return this.search.search(query);
    }

    @Get('assets/:id')
    @ApiOperation({
        summary: 'Get one catalog asset',
        description: 'Returns the asset by id, including delisted ones, so existing positions keep resolving.'
    })
    @ApiParam({ name: 'id', description: 'Catalog asset id', schema: { type: 'string', format: 'uuid' } })
    @ApiZodResponse({ status: 200, description: 'The asset', schema: assetItemSchema, example: ITEM_EXAMPLE })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    @ApiProblemResponse({
        status: 404,
        description: 'The asset does not exist (catalog.asset_not_found)',
        example: {
            type: 'catalog.asset_not_found',
            title: 'AssetNotFoundError',
            status: 404,
            detail: 'The asset does not exist in the catalog.',
            requestId: '0199c3a0-0000-7000-8000-000000000003',
            meta: { assetId: '0199c3a0-7b1e-7c2a-9d4e-2f6a8b1c3d5e' }
        }
    })
    public async get(@Param('id', ParseUUIDPipe) id: string): Promise<AssetItem> {
        return this.search.findById(id);
    }
}
