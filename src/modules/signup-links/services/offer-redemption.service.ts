import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { CompanyTrialHistory, CompanyTrialService } from '../../identity/services/company-trial.service';
import { PlatformAvailabilityService } from '../../identity/services/platform-availability.service';
import { PlanContractService } from '../../plans/services/plan-contract.service';
import { signupLinksConfig } from '../config/signup-links.config';
import { SignupLinkDomain } from '../domain/signup-link.domain';
import { statusOf } from '../domain/signup-link-status';
import { SignupRedemptionDomain } from '../domain/signup-redemption.domain';
import {
    RedeemEmailAlreadyUsedError,
    RedeemNotEligibleError,
    RedeemTooManyFromIpError,
    SignupLinkNotFoundError
} from '../domain/signup-links.errors';
import {
    AccountHistory,
    LINK_STATUSES,
    REDEEM_REJECTIONS,
    RedeemSubject,
    RedemptionSource,
    SignupLink,
    SignupRedemption,
    TRIAL_KINDS
} from '../domain/signup-links.types';
import { RedemptionEligibilityValidation } from '../domain/validations/redemption-eligibility.validation';
import { TrialEmailMarkService } from './trial-email-mark.service';

const IP_WINDOW_SECONDS: number = 24 * 60 * 60;

@Injectable()
export class OfferRedemptionService {
    public constructor(
        private readonly links: SignupLinkDomain,
        private readonly redemptions: SignupRedemptionDomain,
        private readonly marks: TrialEmailMarkService,
        private readonly contract: PlanContractService,
        private readonly trials: CompanyTrialService,
        private readonly availability: PlatformAvailabilityService,
        private readonly throttle: ThrottleService,
        @Inject(signupLinksConfig.KEY) private readonly config: ConfigType<typeof signupLinksConfig>
    ) {}

    public enabled(): boolean {
        return this.availability.enabled();
    }

    public async redeem(token: string, subject: RedeemSubject, source: RedemptionSource): Promise<SignupRedemption> {
        if (!this.enabled()) {
            throw new SignupLinkNotFoundError();
        }
        const link: SignupLink | null = await this.links.findByToken(token);
        if (!link || statusOf(link, new Date()) !== LINK_STATUSES.active) {
            throw new SignupLinkNotFoundError();
        }
        RedemptionEligibilityValidation.assertEligible(subject, await this.historyOf(), link);
        await this.assertIpAllowed(subject.ip);
        return this.commit(link, subject, source);
    }

    @UsingTransaction()
    private async commit(link: SignupLink, subject: RedeemSubject, source: RedemptionSource): Promise<SignupRedemption> {
        const now: Date = new Date();
        const startsTrial: boolean = link.trialKind === TRIAL_KINDS.noCard;
        if ((await this.links.consumeUse(link.id, now, startsTrial)) === null) {
            throw new SignupLinkNotFoundError();
        }
        await this.markEmail(link, subject);
        const redemption: SignupRedemption | null = await this.redemptions.record(link, source, now);
        if (redemption === null) {
            throw new RedeemNotEligibleError(REDEEM_REJECTIONS.alreadyRedeemed);
        }
        if (startsTrial) {
            await this.contract.openTrial('premium', { startsAt: now, days: link.trialDays ?? 0 });
        }
        return redemption;
    }

    private async markEmail(link: SignupLink, subject: RedeemSubject): Promise<void> {
        if (!RedemptionEligibilityValidation.marksEmail(subject, link)) {
            return;
        }
        if (!(await this.marks.claim(subject.email, link.id))) {
            throw new RedeemEmailAlreadyUsedError();
        }
    }

    private async historyOf(): Promise<AccountHistory> {
        const company: CompanyTrialHistory = await this.trials.history();
        return {
            isPlatform: company.isPlatform,
            trialUsed: company.trialUsed,
            everPremium: await this.contract.everHadPremium(),
            alreadyRedeemed: (await this.redemptions.current()) !== null
        };
    }

    private async assertIpAllowed(ip: string | null): Promise<void> {
        if (ip === null) {
            return;
        }
        const key: string = `signup-redeem:${ip}`;
        if (!(await this.throttle.isAllowed(key, this.config.SIGNUP_REDEEM_IP_DAILY_LIMIT, IP_WINDOW_SECONDS))) {
            throw new RedeemTooManyFromIpError();
        }
    }
}
