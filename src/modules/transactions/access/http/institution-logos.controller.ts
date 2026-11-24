import { Controller, Get, Header, Param, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponse } from '../../../../core/http/api-problem.decorator';
import { RateLimit } from '../../../../core/throttle/rate-limit.decorator';
import { AccountApplication } from '../../application/account.application';
import type { InstitutionLogoImage } from '../../services/institution-logo.service';
import { InstitutionLogoParamsDto } from '../../validation/transactions.schemas';

const CACHE_CONTROL: string = 'public, max-age=86400';
const LOGOS_PER_WINDOW: number = 600;
const WINDOW_SECONDS: number = 15 * 60;

@ApiTags('spending')
@Controller('spending/institution-logos')
export class InstitutionLogosController {
    public constructor(private readonly accounts: AccountApplication) {}

    @Get(':token')
    @Header('X-Content-Type-Options', 'nosniff')
    @Header('Cross-Origin-Resource-Policy', 'cross-origin')
    @RateLimit({
        key: 'institution-logo',
        limit: LOGOS_PER_WINDOW,
        windowSeconds: WINDOW_SECONDS,
        identify: (subject) => subject.ip
    })
    @ApiParam({ name: 'token', description: 'Signed token from the institutionLogoUrl path of an account or connection' })
    @ApiOperation({
        summary: 'Bank logo, served by the API',
        description:
            'Public, no session: an image tag cannot send the access token, and the signed token is the proof. The API fetches the ' +
            'logo from the provider once, keeps it in memory and serves it, so the browser never contacts a third-party origin. Only ' +
            'URLs the API itself signed are fetched; anything else is a 404.'
    })
    @ApiProduces('image/png', 'image/jpeg', 'image/webp', 'image/gif')
    @ApiResponse({ status: 200, description: 'The logo image' })
    @ApiProblemResponse({
        status: 404,
        description: 'Invalid token, or the provider logo is unavailable (transactions.logo_not_found)',
        example: { type: 'transactions.logo_not_found', title: 'InstitutionLogoNotFoundError', status: 404 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many calls from this IP (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    public async logo(@Param() params: InstitutionLogoParamsDto, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
        const image: InstitutionLogoImage = await this.accounts.logo(params.token);
        response.setHeader('Cache-Control', CACHE_CONTROL);
        return new StreamableFile(image.content, { type: image.contentType });
    }
}
