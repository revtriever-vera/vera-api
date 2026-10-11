import { Injectable } from '@nestjs/common';
import { BankConnectionDomain } from '../domain/bank-connection.domain';
import { BankConnection, BankConnectionAccount, ConnectionDetails, ConnectionView } from '../domain/bank-connections.types';
import { LinkedAccountSource, toConnectionView } from '../domain/connection.mapper';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';

@Injectable()
export class ConnectionViewService {
    public constructor(
        private readonly connections: BankConnectionDomain,
        private readonly accounts: FinancialAccountService
    ) {}

    public async listViews(): Promise<ConnectionView[]> {
        return this.render(await this.connections.listDetails());
    }

    public async viewsOf(connections: readonly BankConnection[]): Promise<ConnectionView[]> {
        return this.render(await this.connections.detailsOf(connections));
    }

    private async render(details: readonly ConnectionDetails[]): Promise<ConnectionView[]> {
        const accountIds: string[] = [
            ...new Set<string>(
                details.flatMap((entry: ConnectionDetails): string[] =>
                    entry.links.map((link: BankConnectionAccount): string => link.accountId)
                )
            )
        ];
        const accounts: Map<string, LinkedAccountSource> = new Map<string, LinkedAccountSource>(
            (await this.accounts.findByIds(accountIds)).map((account: LinkedAccountSource): [string, LinkedAccountSource] => [
                account.id,
                account
            ])
        );
        return details.map((entry: ConnectionDetails): ConnectionView => toConnectionView(entry, accounts));
    }
}
