import { Injectable } from '@nestjs/common';
import { TooManyAttemptsError, ThrottleService } from '../../../core/throttle/throttle.service';
import { PlatformDisabledError, InvalidTotpTokenError } from '../domain/identity.errors';
import { User } from '../domain/identity.types';
import { PlatformAvailabilityService } from './platform-availability.service';
import { SecondFactorNotifierService } from './second-factor-notifier.service';
import { SecondFactorClaims, SecondFactorPurpose, TokenService } from './token.service';

export const SECOND_FACTOR_ATTEMPT_LIMIT: number = 5;
export const SECOND_FACTOR_WINDOW_SECONDS: number = 15 * 60;

@Injectable()
export class SecondFactorGateService {
    public constructor(
        private readonly availability: PlatformAvailabilityService,
        private readonly tokens: TokenService,
        private readonly throttle: ThrottleService,
        private readonly notifier: SecondFactorNotifierService
    ) {}

    public claims(token: string, purpose: SecondFactorPurpose): SecondFactorClaims {
        if (!this.availability.enabled()) {
            throw new PlatformDisabledError();
        }
        const claims: SecondFactorClaims | null = this.tokens.verifySecondFactorToken(token, purpose);
        if (!claims) {
            throw new InvalidTotpTokenError();
        }
        return claims;
    }

    public async admit(user: User, ip: string | undefined): Promise<void> {
        const attempts: number = await this.throttle.countAttempt(`second-factor:${user.id}`, SECOND_FACTOR_WINDOW_SECONDS);
        if (attempts <= SECOND_FACTOR_ATTEMPT_LIMIT) {
            return;
        }
        if (attempts === SECOND_FACTOR_ATTEMPT_LIMIT + 1) {
            await this.notifier.locked(user, ip);
        }
        throw new TooManyAttemptsError();
    }
}
