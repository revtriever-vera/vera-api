import { Injectable } from '@nestjs/common';
import { PlatformAccountsService } from '../services/platform-accounts.service';
import {
    AccessRequestDto,
    AccessResponseView,
    AccountListView,
    AccountsQueryDto,
    OverviewView
} from '../validation/platform-accounts.schemas';

@Injectable()
export class PlatformAccountsApplication {
    public constructor(private readonly accounts: PlatformAccountsService) {}

    public async overview(): Promise<OverviewView> {
        return this.accounts.overview();
    }

    public async list(query: AccountsQueryDto): Promise<AccountListView> {
        return this.accounts.list(query);
    }

    public async access(accountId: string, input: AccessRequestDto): Promise<AccessResponseView> {
        return this.accounts.access(accountId, input);
    }
}
