import { Injectable } from '@nestjs/common';
import { PluggyCredentialsRepository } from '../repositories/pluggy-credentials.repository';
import { CredentialsMissingError } from './bank-connections.errors';
import { PluggyCredential } from './bank-connections.types';

export interface SealedCredentials {
    readonly sealed: string;
    readonly sealerDriver: string;
    readonly clientIdHint: string;
    readonly verifiedWith: string;
}

export interface ReplacedCredentials {
    readonly credential: PluggyCredential;
    readonly replaced: boolean;
}

@Injectable()
export class PluggyCredentialsDomain {
    public constructor(private readonly credentials: PluggyCredentialsRepository) {}

    public async find(): Promise<PluggyCredential | null> {
        return this.credentials.findCurrent();
    }

    public async require(): Promise<PluggyCredential> {
        const current: PluggyCredential | null = await this.credentials.findCurrent();
        if (current === null) {
            throw new CredentialsMissingError();
        }
        return current;
    }

    public async replace(sealed: SealedCredentials): Promise<ReplacedCredentials> {
        return this.credentials.replaceCurrent(sealed);
    }

    public async markValid(verifiedWith: string): Promise<PluggyCredential> {
        const current: PluggyCredential = await this.require();
        return (await this.credentials.markValid(current.id, verifiedWith)) ?? current;
    }

    public async markInvalid(errorCode: string): Promise<PluggyCredential | null> {
        const current: PluggyCredential | null = await this.credentials.findCurrent();
        return current === null ? null : this.credentials.markInvalid(current.id, errorCode);
    }

    public async eraseAll(): Promise<number> {
        return this.credentials.eraseAll();
    }

    public async replaceSealed(id: string, sealed: string, sealerDriver: string): Promise<void> {
        await this.credentials.replaceSealed(id, sealed, sealerDriver);
    }

    public async listCompanyIds(): Promise<string[]> {
        return this.credentials.listCompanyIdsAcrossTenants();
    }
}
