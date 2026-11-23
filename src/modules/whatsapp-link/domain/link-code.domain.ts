import { Injectable } from '@nestjs/common';
import { HashUtil } from '../../../shared/utils/hash.util';
import { IdUtil } from '../../../shared/utils/id.util';
import { WhatsAppLinkCodesRepository } from '../repositories/whatsapp-link-codes.repository';
import { WhatsAppLinkCode } from './whatsapp-link.types';

@Injectable()
export class LinkCodeDomain {
    public constructor(private readonly codes: WhatsAppLinkCodesRepository) {}

    public hashOf(code: string): string {
        return HashUtil.sha256(code);
    }

    public async issue(userId: string, code: string, expiresAt: Date): Promise<WhatsAppLinkCode> {
        await this.codes.cancelPendingOfUser(userId);
        return this.codes.create({ id: IdUtil.newId(), userId, codeHash: this.hashOf(code), expiresAt });
    }

    public async cancelPendingOfUser(userId: string): Promise<number> {
        return this.codes.cancelPendingOfUser(userId);
    }

    public async cancelPendingOfCompany(): Promise<number> {
        return this.codes.cancelPendingOfCompany();
    }

    public async pendingOfUser(userId: string, now: Date): Promise<WhatsAppLinkCode | null> {
        return this.codes.findPendingOfUser(userId, now);
    }

    public async consume(id: string, now: Date): Promise<boolean> {
        return this.codes.consume(id, now);
    }

    public async eraseAll(batch: number): Promise<number> {
        return this.codes.eraseAll(batch);
    }

    public async pendingByCodeAcrossTenants(code: string, now: Date): Promise<WhatsAppLinkCode | null> {
        return this.codes.findPendingByCodeHashAcrossTenants(this.hashOf(code), now);
    }
}
