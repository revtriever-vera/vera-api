import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { ContributionSuggestionApplication } from '../../application/contribution-suggestion.application';
import { SuggestRequestDto, SuggestResponse, suggestRequestSchema, suggestResponseSchema } from '../../validation/contribution.schemas';

const SUGGESTIONS_PER_MINUTE: number = 60;
const ONE_MINUTE_SECONDS: number = 60;

@ApiTags('portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolio/contributions')
export class ContributionController {
    public constructor(private readonly suggestions: ContributionSuggestionApplication) {}

    @Post('suggest')
    @HttpCode(HttpStatus.OK)
    @RateLimit({
        key: 'contribution-suggest',
        limit: SUGGESTIONS_PER_MINUTE,
        windowSeconds: ONE_MINUTE_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Suggest where to put a new contribution',
        description:
            'Distributes the amount among the classes and, inside each class, among the holdings, to bring the portfolio closer to ' +
            'the target without selling anything. A class below its target receives the difference up to the target; when the amount ' +
            'does not cover everything the money is split in proportion to what is missing, and any surplus follows the targets. ' +
            'Amounts are integers in the minor unit of the base currency and add up exactly to the contribution on both layers. ' +
            'Matured fixed income titles receive nothing. Nothing is stored. The result approximates the target; it is not an ' +
            'individual investment recommendation.'
    })
    @ApiZodBody(suggestRequestSchema)
    @ApiZodResponse({ status: 200, description: 'The suggestion on both layers', schema: suggestResponseSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid amount: not an integer from 1 to 100,000,000,000 (zod validation details in meta.errors)'
    })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    @ApiProblemResponse({ status: 422, description: 'Every class target is zero (contribution.targets_not_set)' })
    @ApiProblemResponse({ status: 429, description: 'More than 60 suggestions in a minute for the company' })
    public async suggest(@Body() body: SuggestRequestDto): Promise<SuggestResponse> {
        return this.suggestions.suggest(body.amountMinor);
    }
}
