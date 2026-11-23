import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import { SignupLinksRepository } from '../repositories/signup-links.repository';
import { statusOf } from './signup-link-status';
import { SignupLinkNotFoundError, SignupLinkRevokedError } from './signup-links.errors';
import { SignupLinkOfferValidation } from './validations/signup-link-offer.validation';
import { DiscountRule, LINK_STATUSES, LinkOfferInput, LinkOfferPatch, NewSignupLink, SignupLink, TrialKind } from './signup-links.types';

const TOKEN_BYTES: number = 24;

export interface FunnelChange {
    readonly trials: number;
    readonly subscriptions: number;
}

export interface RevokeOutcome {
    readonly link: SignupLink;
    readonly changed: boolean;
}

export interface UpdateOutcome {
    readonly before: SignupLink;
    readonly after: SignupLink;
}

@Injectable()
export class SignupLinkDomain {
    public constructor(private readonly links: SignupLinksRepository) {}

    public async create(offer: LinkOfferInput, operatorUserId: string | null, now: Date): Promise<SignupLink> {
        SignupLinkOfferValidation.assertValid(offer, now, true);
        return this.links.create({
            id: IdUtil.newId(),
            token: randomBytes(TOKEN_BYTES).toString('base64url'),
            label: offer.label,
            trialKind: offer.trial.kind,
            trialDays: offer.trial.days,
            rules: JSON.stringify(offer.rules),
            maxUses: offer.maxUses,
            expiresAt: offer.expiresAt,
            offerValidityDays: offer.offerValidityDays,
            createdByUserId: operatorUserId
        });
    }

    public async update(id: string, patch: LinkOfferPatch, now: Date): Promise<UpdateOutcome> {
        const before: SignupLink | null = await this.links.lockById(id);
        if (before === null) {
            throw new SignupLinkNotFoundError();
        }
        if (before.revokedAt !== null) {
            throw new SignupLinkRevokedError();
        }
        const offer: LinkOfferInput = this.mergeOffer(before, patch);
        const expiryChanged: boolean = (offer.expiresAt?.getTime() ?? null) !== (before.expiresAt?.getTime() ?? null);
        SignupLinkOfferValidation.assertValid(offer, now, expiryChanged);
        const after: SignupLink | null = await this.links.updateOffer(id, this.rowOf(offer), now);
        if (after === null) {
            throw new SignupLinkNotFoundError();
        }
        return { before, after };
    }

    public async listNewestFirst(limit: number): Promise<SignupLink[]> {
        return this.links.listNewestFirst(limit);
    }

    public async findByToken(token: string): Promise<SignupLink | null> {
        return this.links.findByToken(token);
    }

    public async revoke(id: string, now: Date): Promise<RevokeOutcome> {
        const revoked: SignupLink | null = await this.links.markRevoked(id, now);
        if (revoked) {
            return { link: revoked, changed: true };
        }
        const existing: SignupLink | null = await this.links.findById(id);
        if (!existing) {
            throw new SignupLinkNotFoundError();
        }
        return { link: existing, changed: false };
    }

    public async consumeUse(id: string, now: Date, startsTrial: boolean): Promise<SignupLink | null> {
        const locked: SignupLink | null = await this.links.lockById(id);
        if (locked === null || statusOf(locked, now) !== LINK_STATUSES.active) {
            return null;
        }
        return this.links.addUse(locked, now, startsTrial);
    }

    public async countFunnel(id: string, change: FunnelChange, now: Date): Promise<void> {
        const locked: SignupLink | null = await this.links.lockById(id);
        if (locked !== null) {
            await this.links.addFunnel(locked, change, now);
        }
    }

    private mergeOffer(before: SignupLink, patch: LinkOfferPatch): LinkOfferInput {
        return {
            label: patch.label ?? before.label,
            trial: patch.trial ?? { kind: before.trialKind as TrialKind, days: before.trialDays },
            rules: patch.rules ?? (before.rules as unknown as DiscountRule[]),
            maxUses: patch.maxUses === undefined ? before.maxUses : patch.maxUses,
            expiresAt: patch.expiresAt === undefined ? before.expiresAt : patch.expiresAt,
            offerValidityDays: patch.offerValidityDays ?? before.offerValidityDays
        };
    }

    private rowOf(
        offer: LinkOfferInput
    ): Pick<NewSignupLink, 'label' | 'trialKind' | 'trialDays' | 'rules' | 'maxUses' | 'expiresAt' | 'offerValidityDays'> {
        return {
            label: offer.label,
            trialKind: offer.trial.kind,
            trialDays: offer.trial.days,
            rules: JSON.stringify(offer.rules),
            maxUses: offer.maxUses,
            expiresAt: offer.expiresAt,
            offerValidityDays: offer.offerValidityDays
        };
    }
}
