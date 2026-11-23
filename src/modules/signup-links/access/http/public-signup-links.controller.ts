import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { ApiZodResponse } from '../../../../core/http/api-zod.decorators';
import { RateLimit } from '../../../../core/throttle/rate-limit.decorator';
import { SignupLinksPublicApplication } from '../../application/signup-links-public.application';
import { PublicOfferView, publicOfferSchema, SignupLinkTokenParamsDto } from '../../validation/signup-links.schemas';

const LOOKUP_LIMIT: number = 30;
const LOOKUP_WINDOW_SECONDS: number = 60;

@ApiTags('signup-links')
@Controller('signup-links')
export class PublicSignupLinksController {
    public constructor(private readonly links: SignupLinksPublicApplication) {}

    @Get(':token')
    @RateLimit({ key: 'signup-link-lookup', limit: LOOKUP_LIMIT, windowSeconds: LOOKUP_WINDOW_SECONDS, identify: (subject) => subject.ip })
    @ApiOperation({
        summary: 'Read the offer behind a signup link',
        description:
            'Public. Returns the trial and the discount scale of a usable link, so the signup page can show them before login. ' +
            'A link that does not exist, was revoked, expired or ran out of uses answers the same 404, and so does a self-hosted deployment. ' +
            'Limited per IP.'
    })
    @ApiParam({ name: 'token', description: 'Token of the signup link, as it appears in the URL' })
    @ApiZodResponse({ status: 200, description: 'The offer', schema: publicOfferSchema })
    @ApiProblemResponse({
        status: 404,
        description: 'No usable link with this token (signup_links.not_found)',
        example: { type: 'signup_links.not_found', title: 'SignupLinkNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'More than 30 lookups in a minute from this IP (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async offer(@Param() params: SignupLinkTokenParamsDto): Promise<PublicOfferView> {
        return this.links.offerOf(params.token);
    }
}
