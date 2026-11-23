import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { HashUtil } from '../../../shared/utils/hash.util';
import { signupLinksConfig } from '../config/signup-links.config';
import { SignupEmailMarkDomain } from '../domain/signup-email-mark.domain';
import { TrialEmailUtil } from '../domain/trial-email.util';

const PURPOSE: string = 'signup-email-mark:';

@Injectable()
export class TrialEmailMarkService {
    public constructor(
        private readonly marks: SignupEmailMarkDomain,
        private readonly hmac: HmacPort,
        @Inject(signupLinksConfig.KEY) private readonly config: ConfigType<typeof signupLinksConfig>
    ) {}

    public hashOf(email: string): string {
        const canonical: string = `${PURPOSE}${TrialEmailUtil.canonical(email)}`;
        const key: string | null = this.config.SIGNUP_EMAIL_MARK_HMAC_KEY;
        return key === null ? this.hmac.sha256Hex(canonical) : HashUtil.hmacSha256(canonical, key);
    }

    public async claim(email: string, signupLinkId: string): Promise<boolean> {
        return this.marks.claim(this.hashOf(email), signupLinkId);
    }
}
