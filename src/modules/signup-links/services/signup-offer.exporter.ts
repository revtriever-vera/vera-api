import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { SignupRedemptionDomain } from '../domain/signup-redemption.domain';
import { SignupRedemption } from '../domain/signup-links.types';
import { SignupLinkViewMapper } from './signup-link-view.mapper';
import { RedeemedOfferView } from '../validation/signup-links.schemas';

export const SIGNUP_OFFER_EXPORT_AREA: string = 'signup_offer';

export interface SignupOfferExport extends RedeemedOfferView {
    readonly source: string;
    readonly trialStartedAt: string | null;
    readonly appliedAt: string | null;
}

@Injectable()
export class SignupOfferExporter extends AccountDataExporterPort {
    public readonly area: string = SIGNUP_OFFER_EXPORT_AREA;

    public constructor(
        private readonly redemptions: SignupRedemptionDomain,
        private readonly mapper: SignupLinkViewMapper
    ) {
        super();
    }

    public async exportAll(): Promise<SignupOfferExport | null> {
        const redemption: SignupRedemption | null = await this.redemptions.current();
        if (redemption === null) {
            return null;
        }
        return {
            ...this.mapper.toRedeemedView(redemption),
            source: redemption.source,
            trialStartedAt: redemption.trialStartedAt?.toISOString() ?? null,
            appliedAt: redemption.appliedAt?.toISOString() ?? null
        };
    }
}
