import { Injectable } from '@nestjs/common';
import { BankConnectionDomain } from '../domain/bank-connection.domain';
import { ConnectionIdentity, StatusCount } from '../domain/bank-connections.types';

export type { ConnectionIdentity };

@Injectable()
export class BankConnectionReaderService {
    public constructor(private readonly connections: BankConnectionDomain) {}

    public async countActive(): Promise<number> {
        return this.connections.countAll();
    }

    public async countConnected(): Promise<number> {
        return this.connections.countConnected();
    }

    public async listActiveAcrossTenants(): Promise<readonly ConnectionIdentity[]> {
        return this.connections.listSyncableAcrossTenants();
    }

    public async countByStatusAcrossTenants(): Promise<readonly StatusCount[]> {
        return this.connections.countByStatusAcrossTenants();
    }

    public async findByIdAcrossTenants(id: string): Promise<ConnectionIdentity | null> {
        return this.connections.findIdentityAcrossTenants(id);
    }
}
