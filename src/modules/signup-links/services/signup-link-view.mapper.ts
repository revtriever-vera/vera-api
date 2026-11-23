import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { signupLinksConfig } from '../config/signup-links.config';
import { statusOf } from '../domain/signup-link-status';
import { DiscountRule, SignupLink, TrialKind } from '../domain/signup-links.types';
import { discountRuleSchema, PublicOfferView, SignupLinkView } from '../validation/signup-links.schemas';

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
            status: statusOf(link, now),
            redemptionCount: link.redemptionCount,
            trialCount: link.trialCount,
            subscriptionCount: link.subscriptionCount,
            revokedAt: link.revokedAt?.toISOString() ?? null,
            createdAt: link.createdAt.toISOString()
        };
    }

    public toPublicView(link: SignupLink): PublicOfferView {
        return {
            trial: { kind: link.trialKind as TrialKind, days: link.trialDays },
            rules: this.rulesOf(link),
            expiresAt: link.expiresAt?.toISOString() ?? null
        };
    }

    private rulesOf(link: SignupLink): DiscountRule[] {
        return discountRuleSchema.array().parse(link.rules);
    }
}
