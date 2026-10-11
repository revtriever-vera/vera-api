import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { BankConnectionDomain } from '../domain/bank-connection.domain';
import { BankConnection, ConnectionDetails, PluggyCredential } from '../domain/bank-connections.types';
import { hintOf } from '../domain/client-id-hint';
import { PluggyCredentialsDomain } from '../domain/pluggy-credentials.domain';

export const BANK_CONNECTIONS_EXPORT_AREA: string = 'bank_connections';

export interface BankConnectionsExport {
    readonly credentials: { readonly configured: true; readonly clientIdHint: string; readonly status: string } | null;
    readonly connections: readonly {
        readonly connectorName: string | null;
        readonly itemIdHint: string;
        readonly status: string;
        readonly createdAt: string;
        readonly lastSuccessAt: string | null;
    }[];
}

@Injectable()
export class BankConnectionsExporter extends AccountDataExporterPort {
    public readonly area: string = BANK_CONNECTIONS_EXPORT_AREA;

    public constructor(
        private readonly credentials: PluggyCredentialsDomain,
        private readonly connections: BankConnectionDomain
    ) {
        super();
    }

    @AsCompany()
    public async exportAll(_companyId: string): Promise<BankConnectionsExport> {
        const credential: PluggyCredential | null = await this.credentials.find();
        const details: ConnectionDetails[] = await this.connections.listDetails();
        return {
            credentials:
                credential === null ? null : { configured: true, clientIdHint: credential.clientIdHint, status: credential.status },
            connections: details.map(({ connection }: ConnectionDetails) => this.toExport(connection))
        };
    }

    private toExport(connection: BankConnection): BankConnectionsExport['connections'][number] {
        return {
            connectorName: connection.connectorName,
            itemIdHint: hintOf(connection.externalItemId),
            status: connection.status,
            createdAt: connection.createdAt.toISOString(),
            lastSuccessAt: connection.lastSuccessAt === null ? null : connection.lastSuccessAt.toISOString()
        };
    }
}
