import { Injectable } from '@nestjs/common';
import { SocialIdentity, TOKEN_PURPOSES, User, UserTotp } from '../domain/identity.types';
import { UserTotpDomain } from '../domain/user-totp.domain';
import { UserTotpValidation } from '../domain/validations/user-totp.validation';
import { PlatformLoginAuditService } from './platform-login-audit.service';
import { TokenService } from './token.service';

export type AdminLoginStep =
    | { readonly outcome: 'totp_enrollment_required'; readonly setupToken: string }
    | { readonly outcome: 'totp_required'; readonly challengeToken: string };

@Injectable()
export class PlatformLoginService {
    public constructor(
        private readonly audit: PlatformLoginAuditService,
        private readonly totps: UserTotpDomain,
        private readonly tokens: TokenService
    ) {}

    public assertEnabled(): void {
        this.audit.assertEnabled();
    }

    public async denied(identity: SocialIdentity, ip: string | undefined): Promise<void> {
        await this.audit.denied(identity, ip);
    }

    public async nextStep(user: User): Promise<AdminLoginStep> {
        const totp: UserTotp | null = await this.totps.findByUserId(user.id);
        if (UserTotpValidation.isActive(totp)) {
            const challengeToken: string = this.tokens.signSecondFactorToken(TOKEN_PURPOSES.totpChallenge, user.id, user.companyId);
            return { outcome: 'totp_required', challengeToken };
        }
        const setupToken: string = this.tokens.signSecondFactorToken(TOKEN_PURPOSES.totpEnrollment, user.id, user.companyId);
        return { outcome: 'totp_enrollment_required', setupToken };
    }
}
