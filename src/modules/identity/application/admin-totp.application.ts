import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { InvalidTotpCodeError, InvalidTotpTokenError } from '../domain/identity.errors';
import { LOGIN_OUTCOMES, LOGIN_PROVIDERS, TOKEN_PURPOSES, User, UserTotp } from '../domain/identity.types';
import { proveSecondFactor, SECOND_FACTOR_METHODS, SecondFactorMethod } from '../domain/second-factor.proof';
import { UserDomain } from '../domain/user.domain';
import { UserTotpDomain } from '../domain/user-totp.domain';
import { AuthTokens, RequestMeta, SessionIssuerPort } from '../ports/session-issuer.port';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { RecoveryCodeBatch } from '../services/recovery-code.service';
import { NewTotpSecret, SecondFactorCodesService } from '../services/second-factor-codes.service';
import { SecondFactorGateService } from '../services/second-factor-gate.service';
import { SecondFactorNotifierService } from '../services/second-factor-notifier.service';
import { SecondFactorClaims } from '../services/token.service';

export interface TotpEnrollment {
    readonly secret: string;
    readonly otpauthUri: string;
}

export interface TotpActivation {
    readonly tokens: AuthTokens;
    readonly recoveryCodes: readonly string[];
}

@Injectable()
export class AdminTotpApplication {
    public constructor(
        private readonly totps: UserTotpDomain,
        private readonly users: UserDomain,
        private readonly codes: SecondFactorCodesService,
        private readonly issuer: SessionIssuerPort,
        private readonly gate: SecondFactorGateService,
        private readonly notifier: SecondFactorNotifierService,
        private readonly context: AppContext,
        private readonly metrics: IdentityMetricsService
    ) {}

    public async enroll(setupToken: string): Promise<TotpEnrollment> {
        const user: User = await this.userOf(this.gate.claims(setupToken, TOKEN_PURPOSES.totpEnrollment));
        const secret: NewTotpSecret = this.codes.newSecret(user.email);
        await this.totps.beginEnrollment(user.id, secret.encrypted);
        return { secret: secret.plain, otpauthUri: secret.otpauthUri };
    }

    public async activate(setupToken: string, code: string, meta: RequestMeta): Promise<TotpActivation> {
        const user: User = await this.userOf(this.gate.claims(setupToken, TOKEN_PURPOSES.totpEnrollment));
        await this.gate.admit(user, meta.ip);
        const pending: UserTotp = await this.totps.requirePending(user.id);
        const step: number | null = this.codes.stepOf(pending, code);
        if (step === null) {
            throw new InvalidTotpCodeError();
        }
        const batch: RecoveryCodeBatch = this.codes.newRecoveryBatch();
        await this.persistActivation(pending, step, batch.hashes);
        await this.gate.cleared(user);
        await this.notifier.enrolled(user, meta.ip);
        const tokens: AuthTokens = await this.complete(user, meta, SECOND_FACTOR_METHODS.totp);
        return { tokens, recoveryCodes: batch.codes };
    }

    public async verify(challengeToken: string, code: string, meta: RequestMeta): Promise<AuthTokens> {
        const user: User = await this.userOf(this.gate.claims(challengeToken, TOKEN_PURPOSES.totpChallenge));
        await this.gate.admit(user, meta.ip);
        const totp: UserTotp = await this.totps.requireActive(user.id);
        const method: SecondFactorMethod = await this.consume(user, totp, code, meta);
        await this.gate.cleared(user);
        return this.complete(user, meta, method);
    }

    @UsingTransaction()
    private async persistActivation(pending: UserTotp, step: number, recoveryCodeHashes: readonly string[]): Promise<void> {
        await this.totps.activate(pending, step, recoveryCodeHashes);
    }

    private async userOf(claims: SecondFactorClaims): Promise<User> {
        this.context.enrich({ companyId: claims.companyId, userId: claims.sub });
        const user: User | null = await this.users.findById(claims.sub);
        if (!user) {
            throw new InvalidTotpTokenError();
        }
        return user;
    }

    private async consume(user: User, totp: UserTotp, code: string, meta: RequestMeta): Promise<SecondFactorMethod> {
        if (this.codes.looksLikeTotpCode(code)) {
            return this.consumeTotp(totp, code);
        }
        if (!(await this.totps.consumeRecoveryCode(user.id, this.codes.recoveryHash(code)))) {
            throw new InvalidTotpCodeError();
        }
        await this.notifier.recoveryCodeUsed(user, meta.ip);
        return SECOND_FACTOR_METHODS.recoveryCode;
    }

    private async consumeTotp(totp: UserTotp, code: string): Promise<SecondFactorMethod> {
        const step: number | null = this.codes.stepOf(totp, code);
        if (step === null || !(await this.totps.claimStep(totp, step))) {
            throw new InvalidTotpCodeError();
        }
        return SECOND_FACTOR_METHODS.totp;
    }

    private async complete(user: User, meta: RequestMeta, method: SecondFactorMethod): Promise<AuthTokens> {
        const tokens: AuthTokens = await this.issuer.issueForPlatform(
            user,
            meta,
            LOGIN_PROVIDERS.google,
            proveSecondFactor(user.id, method)
        );
        await this.notifier.signedIn(user, meta.ip);
        this.metrics.login(LOGIN_PROVIDERS.google, LOGIN_OUTCOMES.success);
        return tokens;
    }
}
