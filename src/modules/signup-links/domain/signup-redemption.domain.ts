import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { IdUtil } from '../../../shared/utils/id.util';
import { SignupRedemptionsRepository } from '../repositories/signup-redemptions.repository';
import { REDEMPTION_VALIDITY_DAYS, RedemptionSource, SignupLink, SignupRedemption, TRIAL_KINDS } from './signup-links.types';

@Injectable()
export class SignupRedemptionDomain {
    public constructor(private readonly redemptions: SignupRedemptionsRepository) {}

    public async current(): Promise<SignupRedemption | null> {
        return this.redemptions.current();
    }

    public async markTrialStarted(at: Date): Promise<boolean> {
        return this.redemptions.markTrialStarted(at);
    }

    public async record(link: SignupLink, source: RedemptionSource, now: Date): Promise<SignupRedemption | null> {
        return this.redemptions.createOnce({
            id: IdUtil.newId(),
            signupLinkId: link.id,
            source,
            trialKind: link.trialKind,
            trialDays: link.trialDays,
            rules: JSON.stringify(link.rules),
            redeemedAt: now,
            expiresAt: DateUtil.addDays(now, REDEMPTION_VALIDITY_DAYS),
            trialStartedAt: link.trialKind === TRIAL_KINDS.noCard ? now : null
        });
    }
}
