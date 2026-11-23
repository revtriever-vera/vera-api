import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiProblemResponse } from '../../../core/http/api-problem.decorator';
import { ApiZodBody, ApiZodResponse } from '../../../core/http/api-zod.decorators';
import { clientIp } from '../../../core/http/client-ip';
import { RateLimit } from '../../../core/throttle/rate-limit.decorator';
import { AdminTotpApplication, TotpActivation, TotpEnrollment } from '../application/admin-totp.application';
import { AuthTokens, RequestMeta } from '../ports/session-issuer.port';
import { RefreshCookieAdapter } from '../services/refresh-cookie.adapter';
import {
    ActivateTotpDto,
    activateTotpResponseSchema,
    activateTotpSchema,
    ActivateTotpResponse,
    EnrollTotpDto,
    EnrollTotpResponse,
    enrollTotpResponseSchema,
    enrollTotpSchema,
    VerifyTotpDto,
    VerifyTotpResponse,
    verifyTotpResponseSchema,
    verifyTotpSchema
} from '../validation/totp.schemas';

interface ProblemDoc {
    readonly status: number;
    readonly description: string;
    readonly example: { readonly type: string; readonly title: string; readonly status: number };
}

const TOTP_IP_LIMIT: number = 30;
const TOTP_IP_WINDOW_SECONDS: number = 15 * 60;

const INVALID_TOKEN_PROBLEM: ProblemDoc = {
    status: 401,
    description: 'Challenge or setup token missing, expired or for another step (identity.invalid_totp_token)',
    example: { type: 'identity.invalid_totp_token', title: 'InvalidTotpTokenError', status: 401 }
};

const DISABLED_PROBLEM: ProblemDoc = {
    status: 404,
    description: 'Self-hosted deployment, there is no platform admin (identity.platform_disabled)',
    example: { type: 'identity.platform_disabled', title: 'PlatformDisabledError', status: 404 }
};

const LOCKED_PROBLEM: ProblemDoc = {
    status: 429,
    description: 'Five attempts in 15 minutes for this person (core.too_many_attempts); also recorded as admin.totp_locked',
    example: { type: 'core.too_many_attempts', title: 'TooManyAttemptsError', status: 429 }
};

@ApiTags('auth')
@Controller('auth/totp')
export class AdminTotpController {
    public constructor(
        private readonly totp: AdminTotpApplication,
        private readonly refreshCookie: RefreshCookieAdapter
    ) {}

    @Post('enroll')
    @HttpCode(HttpStatus.OK)
    @RateLimit({ key: 'auth-totp', limit: TOTP_IP_LIMIT, windowSeconds: TOTP_IP_WINDOW_SECONDS, identify: (subject) => subject.ip })
    @ApiOperation({
        summary: 'Start the authenticator enrollment of the platform admin',
        description:
            'Takes the setup token of the admin login, generates the secret (stored encrypted) and returns it with the otpauth URI for the QR code. ' +
            'Calling it again before activation replaces the pending secret.'
    })
    @ApiZodBody(enrollTotpSchema)
    @ApiZodResponse({ status: 200, description: 'Secret and otpauth URI', schema: enrollTotpResponseSchema })
    @ApiProblemResponse(INVALID_TOKEN_PROBLEM)
    @ApiProblemResponse({
        status: 409,
        description: 'The person already has an active authenticator (identity.totp_already_active)',
        example: { type: 'identity.totp_already_active', title: 'TotpAlreadyActiveError', status: 409 }
    })
    @ApiProblemResponse(DISABLED_PROBLEM)
    public async enroll(@Body() body: EnrollTotpDto): Promise<EnrollTotpResponse> {
        const enrollment: TotpEnrollment = await this.totp.enroll(body.setupToken);
        return { secret: enrollment.secret, otpauthUri: enrollment.otpauthUri };
    }

    @Post('activate')
    @HttpCode(HttpStatus.OK)
    @RateLimit({ key: 'auth-totp', limit: TOTP_IP_LIMIT, windowSeconds: TOTP_IP_WINDOW_SECONDS, identify: (subject) => subject.ip })
    @ApiOperation({
        summary: 'Activate the authenticator with the first code',
        description:
            'Checks the first code, activates the authenticator, returns ten single-use recovery codes (shown only now) and issues the ' +
            'platform session. Records admin.totp_enrolled and e-mails the person. Sets the rt_refresh cookie.'
    })
    @ApiZodBody(activateTotpSchema)
    @ApiZodResponse({ status: 200, description: 'Platform session and recovery codes', schema: activateTotpResponseSchema })
    @ApiProblemResponse(INVALID_TOKEN_PROBLEM)
    @ApiProblemResponse({
        status: 401,
        description: 'Wrong code (identity.invalid_totp_code)',
        example: { type: 'identity.invalid_totp_code', title: 'InvalidTotpCodeError', status: 401 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'No enrollment waiting for activation (identity.totp_not_enrolled)',
        example: { type: 'identity.totp_not_enrolled', title: 'TotpNotEnrolledError', status: 409 }
    })
    @ApiProblemResponse(LOCKED_PROBLEM)
    @ApiProblemResponse(DISABLED_PROBLEM)
    public async activate(
        @Body() body: ActivateTotpDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response
    ): Promise<ActivateTotpResponse> {
        const activation: TotpActivation = await this.totp.activate(body.setupToken, body.code, this.meta(req));
        this.refreshCookie.write(res, activation.tokens.refreshToken);
        return {
            outcome: 'authenticated',
            accessToken: activation.tokens.accessToken,
            user: activation.tokens.user,
            recoveryCodes: [...activation.recoveryCodes]
        };
    }

    @Post('verify')
    @HttpCode(HttpStatus.OK)
    @RateLimit({ key: 'auth-totp', limit: TOTP_IP_LIMIT, windowSeconds: TOTP_IP_WINDOW_SECONDS, identify: (subject) => subject.ip })
    @ApiOperation({
        summary: 'Complete the admin login with the authenticator code or a recovery code',
        description:
            'Accepts the code of the current or previous 30 s window (a code is valid once) or a single-use recovery code; a recovery code ' +
            'also records admin.recovery_code_used and e-mails the person. Issues the platform session and sets the rt_refresh cookie.'
    })
    @ApiZodBody(verifyTotpSchema)
    @ApiZodResponse({ status: 200, description: 'Platform session', schema: verifyTotpResponseSchema })
    @ApiProblemResponse(INVALID_TOKEN_PROBLEM)
    @ApiProblemResponse({
        status: 401,
        description: 'Wrong or already used code (identity.invalid_totp_code)',
        example: { type: 'identity.invalid_totp_code', title: 'InvalidTotpCodeError', status: 401 }
    })
    @ApiProblemResponse({
        status: 409,
        description: 'The person has no active authenticator (identity.totp_not_enrolled)',
        example: { type: 'identity.totp_not_enrolled', title: 'TotpNotEnrolledError', status: 409 }
    })
    @ApiProblemResponse(LOCKED_PROBLEM)
    @ApiProblemResponse(DISABLED_PROBLEM)
    public async verify(
        @Body() body: VerifyTotpDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response
    ): Promise<VerifyTotpResponse> {
        const tokens: AuthTokens = await this.totp.verify(body.challengeToken, body.code, this.meta(req));
        this.refreshCookie.write(res, tokens.refreshToken);
        return { outcome: 'authenticated', accessToken: tokens.accessToken, user: tokens.user };
    }

    private meta(req: Request): RequestMeta {
        return { ip: clientIp(req), userAgent: req.headers['user-agent'] };
    }
}
