import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { signupLinksConfig } from '../config/signup-links.config';
import { statusOf } from '../domain/signup-link-status';
import { DiscountRule, SignupLink, SignupRedemption, TrialKind } from '../domain/signup-links.types';
import { discountRuleSchema, PublicOfferView, RedeemedOfferView, SignupLinkView } from '../validation/signup-links.schemas';

@Injectable()
export class SignupLinkViewMapper {
    public constructor(@Inject(signupLinksConfig.KEY) private readonly config: ConfigType<typeof signupLinksConfig>) {}

    public toAdminView(link: SignupLink, now: Date): SignupLinkView {
        return {
            id: link.id,
            token: link.token,
            url: `${this.config.APP_URL}/entrar?oferta=${link.token}`,
            label: link.label,
            trial: { kind: link.trialKind as TrialKind, days: link.trialDays },
            rules: this.rulesOf(link),
            maxUses: link.maxUses,
            expiresAt: link.expiresAt?.toISOString() ?? null,
            offerValidityDays: link.offerValidityDays,
            status: statusOf(link, now),
            redemptionCount: link.redemptionCount,
            trialCount: link.trialCount,
            subscriptionCount: link.subscriptionCount,
            revokedAt: link.revokedAt?.toISOString() ?? null,
            createdAt: link.createdAt.toISOString()
        };
    }

    public toAuditSnapshot(link: SignupLink): Record<string, unknown> {
        return {
            label: link.label,
            trial: { kind: link.trialKind, days: link.trialDays },
            rules: this.rulesOf(link),
            maxUses: link.maxUses,
            expiresAt: link.expiresAt?.toISOString() ?? null,
            offerValidityDays: link.offerValidityDays
        };
    }

    public toPublicView(link: SignupLink): PublicOfferView {
        return {
            trial: { kind: link.trialKind as TrialKind, days: link.trialDays },
            rules: this.rulesOf(link),
            expiresAt: link.expiresAt?.toISOString() ?? null
        };
    }

    public toRedeemedView(redemption: SignupRedemption): RedeemedOfferView {
        return {
            trial: { kind: redemption.trialKind as TrialKind, days: redemption.trialDays },
            rules: this.rulesOf(redemption),
            redeemedAt: redemption.redeemedAt.toISOString(),
            expiresAt: redemption.expiresAt.toISOString()
        };
    }

    private rulesOf(source: Pick<SignupLink, 'rules'>): DiscountRule[] {
        return discountRuleSchema.array().parse(source.rules);
    }
}
