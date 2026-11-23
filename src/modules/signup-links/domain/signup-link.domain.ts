import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import { SignupLinksRepository } from '../repositories/signup-links.repository';
import { statusOf } from './signup-link-status';
import { SignupLinkNotFoundError } from './signup-links.errors';
import { SignupLinkOfferValidation } from './validations/signup-link-offer.validation';
import { LINK_STATUSES, LinkOfferInput, SignupLink } from './signup-links.types';

const TOKEN_BYTES: number = 24;

export interface RevokeOutcome {
    readonly link: SignupLink;
    readonly changed: boolean;
}

@Injectable()
export class SignupLinkDomain {
    public constructor(private readonly links: SignupLinksRepository) {}

    public async create(offer: LinkOfferInput, operatorUserId: string | null, now: Date): Promise<SignupLink> {
        SignupLinkOfferValidation.assertValid(offer, now);
        return this.links.create({
            id: IdUtil.newId(),
            token: randomBytes(TOKEN_BYTES).toString('base64url'),
            label: offer.label,
            trialKind: offer.trial.kind,
            trialDays: offer.trial.days,
            rules: JSON.stringify(offer.rules),
            maxUses: offer.maxUses,
            expiresAt: offer.expiresAt,
            createdByUserId: operatorUserId
        });
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
}
