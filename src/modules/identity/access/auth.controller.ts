import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { clientIp } from '../../../core/http/client-ip';
import { RateLimit } from '../../../core/throttle/rate-limit.decorator';
import { ProfileApplication, SessionProfile } from '../application/profile.application';
import { SessionApplication } from '../application/session.application';
import { SocialLoginApplication, SocialLoginResult } from '../application/social-login.application';
import { LOGIN_PROVIDERS, LoginProvider } from '../domain/identity.types';
import { AuthTokens, RequestMeta } from '../ports/session-issuer.port';
import { JwtAuthGuard } from '../services/jwt-auth.guard';
import { RefreshCookieAdapter } from '../services/refresh-cookie.adapter';
import {
    FacebookLoginDto,
    facebookLoginSchema,
    GoogleLoginDto,
    googleLoginSchema,
    LoginResponse,
    loginResponseSchema,
    meResponseSchema,
    SessionResponse,
    sessionResponseSchema,
    UpdatePreferencesDto,
    updatePreferencesSchema
} from '../validation/auth.schemas';

const SOCIAL_LOGIN_LIMIT: number = 30;
const SOCIAL_LOGIN_WINDOW_SECONDS: number = 15 * 60;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    public constructor(
        private readonly session: SessionApplication,
        private readonly socialLogin: SocialLoginApplication,
        private readonly profile: ProfileApplication,
        private readonly refreshCookie: RefreshCookieAdapter
    ) {}

    @Post('google')
    @HttpCode(HttpStatus.OK)
    @RateLimit({
        key: 'auth-social',
        limit: SOCIAL_LOGIN_LIMIT,
        windowSeconds: SOCIAL_LOGIN_WINDOW_SECONDS,
        identify: (subject) => subject.ip
    })
    @ApiOperation({
        summary: 'Sign in (or sign up) with a Google ID token',
        description:
            'Verifies the ID token against Google, then signs the person in. A person never seen before gets a company and an ' +
            'owner user in the same call. Sets the rt_refresh cookie.'
    })
    @ApiZodBody(googleLoginSchema)
    @ApiZodResponse({ status: 200, description: 'Session issued — refresh cookie set', schema: loginResponseSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Invalid Google token (identity.invalid_google_token)',
        example: { type: 'identity.invalid_google_token', title: 'InvalidGoogleTokenError', status: 401 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'Email already belongs to an account that cannot be linked (identity.email_in_use)',
        example: { type: 'identity.email_in_use', title: 'EmailInUseError', status: 409 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many attempts from this IP (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'Google sign-in not configured (identity.provider_disabled)',
        example: { type: 'identity.provider_disabled', title: 'ProviderDisabledError', status: 503 }
    })
    public async google(
        @Body() body: GoogleLoginDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response
    ): Promise<LoginResponse> {
        return this.signIn(LOGIN_PROVIDERS.google, body.idToken, req, res);
    }

    @Post('facebook')
    @HttpCode(HttpStatus.OK)
    @RateLimit({
        key: 'auth-social',
        limit: SOCIAL_LOGIN_LIMIT,
        windowSeconds: SOCIAL_LOGIN_WINDOW_SECONDS,
        identify: (subject) => subject.ip
    })
    @ApiOperation({
        summary: 'Sign in (or sign up) with a Facebook access token',
        description:
            'Verifies the access token against the Graph API, then signs the person in. A person never seen before gets a company ' +
            'and an owner user in the same call. Facebook never links to an existing account by email. Sets the rt_refresh cookie.'
    })
    @ApiZodBody(facebookLoginSchema)
    @ApiZodResponse({ status: 200, description: 'Session issued — refresh cookie set', schema: loginResponseSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Invalid Facebook token (identity.invalid_facebook_token)',
        example: { type: 'identity.invalid_facebook_token', title: 'InvalidFacebookTokenError', status: 401 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'Email already belongs to an account that cannot be linked (identity.email_in_use)',
        example: { type: 'identity.email_in_use', title: 'EmailInUseError', status: 409 }
    })
    @ApiProblemResponse({
        status: 422,
        description: 'Facebook account did not share an email (identity.email_not_provided)',
        example: { type: 'identity.email_not_provided', title: 'EmailNotProvidedError', status: 422 }
    })
    @ApiProblemResponse({
        status: 429,
        description: 'Too many attempts from this IP (core.too_many_attempts)',
        example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
    })
    @ApiProblemResponse({
        status: 502,
        description: 'Facebook did not answer (identity.provider_unavailable)',
        example: { type: 'identity.provider_unavailable', title: 'ProviderUnavailableError', status: 502 }
    })
    @ApiProblemResponse({
        status: 503,
        description: 'Facebook sign-in not configured (identity.provider_disabled)',
        example: { type: 'identity.provider_disabled', title: 'ProviderDisabledError', status: 503 }
    })
    public async facebook(
        @Body() body: FacebookLoginDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response
    ): Promise<LoginResponse> {
        return this.signIn(LOGIN_PROVIDERS.facebook, body.accessToken, req, res);
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Rotate the refresh token and issue a new access token',
        description:
            'Reads the rt_refresh cookie. Rotation is single-use: a new session is issued in the same family and the previous one ' +
            'is marked as replaced. Presenting an already-rotated token revokes the entire session family.'
    })
    @ApiZodResponse({ status: 200, description: 'New access token — new refresh cookie set', schema: sessionResponseSchema })
    @ApiProblemResponse({
        status: 401,
        description: 'Missing, expired, revoked or reused refresh token (identity.invalid_refresh)',
        example: { type: 'identity.invalid_refresh', title: 'InvalidRefreshTokenError', status: 401 }
    })
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
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
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
    @ApiProblemResponse({
        status: 401,
        description: 'Missing or invalid access token (identity.unauthorized)',
        example: { type: 'identity.unauthorized', title: 'UnauthorizedError', status: 401 }
    })
    @ApiProblemResponse({
        status: 400,
        description: 'Invalid payload (zod validation details in meta.errors)',
        example: { type: 'validation_failed', title: 'ZodValidationException', status: 400 }
    })
    public async updatePreferences(@Body() body: UpdatePreferencesDto): Promise<SessionProfile> {
        return this.profile.updatePreferences(body);
    }

    private async signIn(provider: LoginProvider, credential: string, req: Request, res: Response): Promise<LoginResponse> {
        const result: SocialLoginResult = await this.socialLogin.login(provider, credential, this.meta(req));
        this.refreshCookie.write(res, result.tokens.refreshToken);
        return {
            outcome: 'authenticated',
            accessToken: result.tokens.accessToken,
            user: result.tokens.user,
            isNewAccount: result.isNewAccount
        };
    }

    private meta(req: Request): RequestMeta {
        return { ip: clientIp(req), userAgent: req.headers['user-agent'] };
    }
}
