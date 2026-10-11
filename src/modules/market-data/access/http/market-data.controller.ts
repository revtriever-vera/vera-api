import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { QuoteReadApplication } from '../../application/quote-read.application';
import {
    ExchangeRateParamDto,
    ExchangeRateResponse,
    QuotesQueryDto,
    QuotesResponse,
    exchangeRateResponseSchema,
    quotesQuerySchema,
    quotesResponseSchema
} from '../../validation/market-data.schemas';

const READS_PER_MINUTE: number = 120;
const ONE_MINUTE_SECONDS: number = 60;

const QUOTES_EXAMPLE: QuotesResponse = {
    quotes: [
        {
            assetId: '0199c3a0-7b1e-7c2a-9d4e-2f6a8b1c3d5e',
            price: '37.8',
            currency: 'BRL',
            priceDate: '2026-10-09',
            source: 'brapi',
            stale: false
        }
    ],
    pendingAssetIds: ['0199c3a0-7b1e-7c2a-9d4e-2f6a8b1c3d5f']
};

const RATE_EXAMPLE: ExchangeRateResponse = { currency: 'USD', brlPerUnit: '5.4231', date: '2026-10-09', source: 'bcb-ptax' };

@ApiTags('market-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('market-data')
export class MarketDataController {
    public constructor(private readonly reads: QuoteReadApplication) {}

    @Get('quotes')
    @RateLimit({
        key: 'market-data-quotes',
        limit: READS_PER_MINUTE,
        windowSeconds: ONE_MINUTE_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Read the stored prices of up to 30 assets',
        description:
            'Reads only the shared quote table, never a provider. Assets with no price yet come back in pendingAssetIds and a ' +
            'background fetch is queued (one per asset per day); stale prices are returned with stale = true and also refreshed.'
    })
    @ApiZodQuery(quotesQuerySchema)
    @ApiZodResponse({
        status: 200,
        description: 'Stored prices and the assets still pending',
        schema: quotesResponseSchema,
        example: QUOTES_EXAMPLE
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid query: missing, malformed or more than 30 ids (zod validation details in meta.errors)',
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
        description: 'More than 120 reads in a minute for the company',
        example: {
            type: 'core.too_many_attempts',
            title: 'TooManyAttemptsError',
            status: 429,
            detail: 'Too many attempts for this key within the configured window.',
            requestId: '0199c3a0-0000-7000-8000-000000000002'
        }
    })
    public async quotes(@Query() query: QuotesQueryDto): Promise<QuotesResponse> {
        return this.reads.quotesOf(query.assetIds);
    }

    @Get('exchange-rates/:currency')
    @ApiOperation({
        summary: 'Read the latest exchange rate to BRL',
        description: 'Latest PTAX sell rate dated on or before today, with its date. USD only in the MVP.'
    })
    @ApiParam({ name: 'currency', description: 'ISO 4217 code of the foreign currency', schema: { type: 'string', example: 'USD' } })
    @ApiZodResponse({ status: 200, description: 'The latest stored rate', schema: exchangeRateResponseSchema, example: RATE_EXAMPLE })
    @ApiProblemResponse({
        status: 400,
        description: 'Malformed currency code (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 404,
        description: 'No rate stored for the currency (market-data.exchange_rate_unavailable)',
        example: {
            type: 'market-data.exchange_rate_unavailable',
            title: 'ExchangeRateUnavailableError',
            status: 404,
            detail: 'No exchange rate is available for the currency.',
            requestId: '0199c3a0-0000-7000-8000-000000000003',
            meta: { currency: 'USD' }
        }
    })
    public async exchangeRate(@Param() params: ExchangeRateParamDto): Promise<ExchangeRateResponse> {
        return this.reads.exchangeRateOf(params.currency);
    }
}
