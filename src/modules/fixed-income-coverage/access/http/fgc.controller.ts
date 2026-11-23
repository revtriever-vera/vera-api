import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit, RateLimitSubject } from '../../../../core/throttle/rate-limit.decorator';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { FgcCoverageApplication } from '../../application/fgc-coverage.application';
import { FgcSimulationApplication } from '../../application/fgc-simulation.application';
import { FGC_SIMULATIONS_PER_MINUTE, FGC_SIMULATION_WINDOW_SECONDS } from '../../domain/fgc.constants';
import {
    FgcQueryDto,
    FgcResponse,
    FgcSimulateBodyDto,
    FgcSimulateResponse,
    fgcQuerySchema,
    fgcResponseSchema,
    fgcSimulateBodySchema,
    fgcSimulateResponseSchema
} from '../../validation/fgc.schemas';

const UNAUTHORIZED: string = 'Missing or invalid access token (identity.unauthorized)';

@ApiTags('portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portfolio/fgc')
export class FgcController {
    public constructor(
        private readonly coverage: FgcCoverageApplication,
        private readonly simulation: FgcSimulationApplication
    ) {}

    @Get()
    @ApiOperation({
        summary: 'FGC coverage by conglomerate',
        description:
            'Groups the CDB, LCI, LCA and LC in BRL of banks associated with the FGC by prudential conglomerate and applies the limit ' +
            'of R$ 250,000 per CPF per conglomerate to the value today (gross of income tax). Matured securities do not count. ' +
            'Holdings the FGC does not cover come back in `outside` with the reason (`not_calculated` is the "Outro emissor" option, not a pending registration). The R$ 1,000,000 cap is a reference only: ' +
            'the real rule is about guarantees paid in 4 years. Amounts are always in BRL.'
    })
    @ApiZodQuery(fgcQuerySchema)
    @ApiZodResponse({ status: 200, description: 'Coverage of the account', schema: fgcResponseSchema })
    @ApiProblemResponse({
        status: 400,
        description: 'holderId informed (fgc.holder_not_supported)',
        example: { type: 'fgc.holder_not_supported', title: 'FgcHolderNotSupportedError', status: 400 }
    })
    @ApiProblemResponse({
        status: 401,
        description: UNAUTHORIZED,
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    public async get(@Query() query: FgcQueryDto): Promise<FgcResponse> {
        return this.coverage.get(query);
    }

    @Post('simulate')
    @HttpCode(200)
    @RateLimit({
        key: 'fgc-simulate',
        limit: FGC_SIMULATIONS_PER_MINUTE,
        windowSeconds: FGC_SIMULATION_WINDOW_SECONDS,
        identify: (subject: RateLimitSubject): string | null => subject.companyId ?? null
    })
    @ApiOperation({
        summary: 'Simulate a security against the FGC limit',
        description:
            'State of the issuer group with a hypothetical security and the verdict: covered, over_limit, not_covered_kind, ' +
            'not_associated or not_calculated (issuer "outro": no coverage calculated). Writes nothing. Use excludeTitleId when editing, so the security is not counted twice. ' +
            'Limited to 60 calls per minute per company.'
    })
    @ApiZodBody(fgcSimulateBodySchema)
    @ApiZodResponse({ status: 200, description: 'Verdict', schema: fgcSimulateResponseSchema })
    @ApiProblemResponse({
        status: 401,
        description: UNAUTHORIZED,
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 422,
        description:
            'Unknown issuer or issuer kind that does not fit the security (fixed_income.unknown_issuer, fixed_income.issuer_kind_mismatch)',
        example: { type: 'fixed_income.unknown_issuer', title: 'UnknownIssuerError', status: 422 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 60 simulations in a minute for the company (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async simulate(@Body() body: FgcSimulateBodyDto): Promise<FgcSimulateResponse> {
        return this.simulation.simulate(body);
    }
}
