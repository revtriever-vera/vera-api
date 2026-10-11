import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { clientIp } from '../../../core/http/client-ip';
import { ProfileApplication, SessionProfile } from '../application/profile.application';
import { SessionApplication } from '../application/session.application';
import { AuthTokens, RequestMeta } from '../ports/session-issuer.port';
import { JwtAuthGuard } from '../services/jwt-auth.guard';
import { RefreshCookieAdapter } from '../services/refresh-cookie.adapter';
import {
    meResponseSchema,
    SessionResponse,
    sessionResponseSchema,
    UpdatePreferencesDto,
    updatePreferencesSchema
} from '../validation/auth.schemas';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    public constructor(
        private readonly session: SessionApplication,
        private readonly profile: ProfileApplication,
        private readonly refreshCookie: RefreshCookieAdapter
    ) {}

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Rotate the refresh token and issue a new access token',
        description:
            'Reads the rt_refresh cookie. Rotation is single-use: a new session is issued in the same family and the previous one ' +
            'is marked as replaced. Presenting an already-rotated token revokes the entire session family.'
    })
    @ApiZodResponse({ status: 200, description: 'New access token — new refresh cookie set', schema: sessionResponseSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing, expired, revoked or reused refresh token (identity.invalid_refresh)' })
    public async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionResponse> {
        const tokens: AuthTokens = await this.session.refresh(this.refreshCookie.read(req), this.meta(req));
        this.refreshCookie.write(res, tokens.refreshToken);
        return { outcome: 'authenticated', accessToken: tokens.accessToken, user: tokens.user };
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Revoke the current session',
        description:
            'Revokes the session behind the rt_refresh cookie and clears it. Idempotent: a missing or unknown cookie also answers 204.'
    })
    public async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
        await this.session.logout(this.refreshCookie.read(req));
        this.refreshCookie.clear(res);
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Current session identity',
        description: 'Returns the user, company, effective locale and sign-in provider of the presented access token.'
    })
    @ApiZodResponse({ status: 200, description: 'Authenticated identity', schema: meResponseSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    public async me(): Promise<SessionProfile> {
        return this.profile.current();
    }

    @Patch('me/preferences')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Save the preferences of the signed-in person',
        description:
            'Today only the personal locale. Null goes back to following the company locale. The effective locale carried by the ' +
            'access token changes at the next refresh.'
    })
    @ApiZodBody(updatePreferencesSchema)
    @ApiZodResponse({ status: 200, description: 'Identity with the saved preferences', schema: meResponseSchema })
    @ApiProblemResponse({ status: 401, description: 'Missing or invalid access token (identity.unauthorized)' })
    @ApiProblemResponse({ status: 400, description: 'Invalid payload (zod validation details in meta.errors)' })
    public async updatePreferences(@Body() body: UpdatePreferencesDto): Promise<SessionProfile> {
        return this.profile.updatePreferences(body);
    }

    private meta(req: Request): RequestMeta {
        return { ip: clientIp(req), userAgent: req.headers['user-agent'] };
    }
}
