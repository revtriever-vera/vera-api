import { Injectable } from '@nestjs/common';
import { BankConnectionAccountsRepository } from '../repositories/bank-connection-accounts.repository';
import { BankConnectionAccount } from './bank-connections.types';

@Injectable()
export class ConnectionLinkDomain {
    public constructor(private readonly links: BankConnectionAccountsRepository) {}

    public async link(connectionId: string, accountId: string, externalAccountId: string): Promise<BankConnectionAccount> {
        return this.links.upsertLink(connectionId, accountId, externalAccountId);
    }

    public async advance(linkId: string, syncedThrough: string): Promise<void> {
        await this.links.advance(linkId, syncedThrough);
    }
}
