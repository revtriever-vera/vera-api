import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AppContext } from '../../../core/context/app-context.port';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AppError } from '../../../shared/errors/app.error';
import { IdUtil } from '../../../shared/utils/id.util';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { googleCalendarConfig } from '../config/google-calendar.config';
import { CalendarOAuthStateDomain } from '../domain/calendar-oauth-state.domain';
import { CalendarCallbackError } from '../domain/calendar.errors';
import { CALLBACK_ERRORS, CallbackError, ClientCredentials } from '../domain/calendar.types';
import { googleAuthorizationUrl } from '../domain/google-authorization-url';
import { OAuthStatePayload, Pkce, newPkce } from '../domain/oauth-state';
import { CalendarCredentialsService } from '../services/calendar-credentials.service';
import { CalendarEnrollmentService } from '../services/calendar-enrollment.service';
import { CalendarLogService } from '../services/calendar-log.service';
import { CalendarStateService } from '../services/calendar-state.service';
import { CallbackQueryDto, StartResponse } from '../validation/calendar.schemas';

@Injectable()
export class CalendarOauthApplication {
    public constructor(
        private readonly states: CalendarOAuthStateDomain,
        private readonly stateTokens: CalendarStateService,
        private readonly credentials: CalendarCredentialsService,
        private readonly enrollment: CalendarEnrollmentService,
        private readonly currentUser: CurrentUserService,
        private readonly context: AppContext,
        private readonly logs: CalendarLogService,
        @Inject(googleCalendarConfig.KEY) private readonly config: ConfigType<typeof googleCalendarConfig>
    ) {}

    public async start(): Promise<StartResponse> {
        const credentials: ClientCredentials = await this.credentials.require();
        const user: Awaited<ReturnType<CurrentUserService['require']>> = await this.currentUser.require();
        const now: Date = new Date();
        const nonce: string = IdUtil.newId();
        const pkce: Pkce = newPkce();
        await this.states.open(nonce, user.id, pkce.verifier, now);
        const state: string = this.stateTokens.issue(
            { companyId: this.context.get().companyId ?? '', userId: user.id, nonce, hint: user.email },
            now
        );
        this.logs.started();
        return { url: googleAuthorizationUrl({ credentials, state, codeChallenge: pkce.challenge, loginHint: user.email }) };
    }

    public async callback(query: CallbackQueryDto): Promise<string> {
        try {
            await this.complete(query);
            return `${this.config.APP_URL}/settings/calendar?connected=1`;
        } catch (error: unknown) {
            return `${this.config.APP_URL}/settings/calendar?error=${encodeURIComponent(this.errorCodeOf(error))}`;
        }
    }

    @AsCompany()
    public async completeFor(_companyId: string, payload: OAuthStatePayload, code: string): Promise<void> {
        const now: Date = new Date();
        const verifier: string | null = await this.states.consume(payload.nonce, payload.userId, now);
        if (verifier === null) {
            this.logs.stateRejected();
            throw new CalendarCallbackError(CALLBACK_ERRORS.stateInvalid);
        }
        await this.enrollment.enroll(payload, code, verifier, now);
    }

    private async complete(query: CallbackQueryDto): Promise<void> {
        if (query.error !== undefined) {
            this.logs.denied();
            throw new CalendarCallbackError(CALLBACK_ERRORS.consentDenied);
        }
        const payload: OAuthStatePayload | null =
            query.state === undefined || query.code === undefined ? null : this.stateTokens.read(query.state, new Date());
        if (payload === null || query.code === undefined) {
            this.logs.stateRejected();
            throw new CalendarCallbackError(CALLBACK_ERRORS.stateInvalid);
        }
        await this.completeFor(payload.companyId, payload, query.code);
    }

    private errorCodeOf(error: unknown): CallbackError {
        if (error instanceof CalendarCallbackError) {
            return error.reason;
        }
        if (error instanceof AppError) {
            return CALLBACK_ERRORS.providerUnavailable;
        }
        throw error;
    }
}
