import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { NewSignupLink, SignupLink } from '../domain/signup-links.types';

type OfferData = Pick<NewSignupLink, 'label' | 'trialKind' | 'trialDays' | 'rules' | 'maxUses' | 'expiresAt' | 'offerValidityDays'>;

type CreateData = Pick<
    NewSignupLink,
    'id' | 'token' | 'label' | 'trialKind' | 'trialDays' | 'rules' | 'maxUses' | 'expiresAt' | 'offerValidityDays' | 'createdByUserId'
>;

@Injectable()
export class SignupLinksRepository extends BareGlobalRepository<'SignupLinks'> {
    public constructor(database: DatabaseClient) {
        super(database, 'SignupLinks');
    }

    public async create(data: CreateData): Promise<SignupLink> {
        return this.createRow(data);
    }

    public async updateOffer(id: string, offer: OfferData, now: Date): Promise<SignupLink | null> {
        return this.updateRow(id, { ...offer, updatedAt: now });
    }

    public async findByToken(token: string): Promise<SignupLink | null> {
        return this.findOne({ token });
    }

    public async listNewestFirst(limit: number): Promise<SignupLink[]> {
        return this.findMany({}, { orderBy: [{ property: 'createdAt', direction: 'desc' }], limit });
    }

    public async markRevoked(id: string, at: Date): Promise<SignupLink | null> {
        const revoked: SignupLink[] = await this.updateManyRows({ id, revokedAt: null }, { revokedAt: at, updatedAt: at });
        return revoked[0] ?? null;
    }

    public async lockById(id: string): Promise<SignupLink | null> {
        const row: SignupLink | undefined = await this.selectSkipConstraint()
            .selectAll()
            .where('id', '=', id)
            .forUpdate()
            .executeTakeFirst();
        return row ?? null;
    }

    public async addUse(locked: SignupLink, now: Date, startsTrial: boolean): Promise<SignupLink | null> {
        return this.updateRow(locked.id, {
            redemptionCount: locked.redemptionCount + 1,
            trialCount: locked.trialCount + (startsTrial ? 1 : 0),
            updatedAt: now
        });
    }

    public async addFunnel(locked: SignupLink, change: { trials: number; subscriptions: number }, now: Date): Promise<SignupLink | null> {
        return this.updateRow(locked.id, {
            trialCount: Math.max(0, locked.trialCount + change.trials),
            subscriptionCount: Math.max(0, locked.subscriptionCount + change.subscriptions),
            updatedAt: now
        });
    }
}
