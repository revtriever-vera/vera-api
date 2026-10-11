import { Injectable } from '@nestjs/common';
import { ResealableSecretsPort, SealedRecord } from '../../../core/crypto/resealable-secrets.port';
import { SecretSealerPort } from '../../../core/crypto/secret-sealer.port';
import { PLUGGY_CREDENTIALS_PURPOSE, PluggyCredential } from '../domain/bank-connections.types';
import { PluggyCredentialsDomain } from '../domain/pluggy-credentials.domain';

@Injectable()
export class PluggyCredentialsResealer extends ResealableSecretsPort {
    public readonly purpose: string = PLUGGY_CREDENTIALS_PURPOSE;

    public constructor(
        private readonly credentials: PluggyCredentialsDomain,
        private readonly sealer: SecretSealerPort
    ) {
        super();
    }

    public async listCompanyIds(): Promise<string[]> {
        return this.credentials.listCompanyIds();
    }

    public async listSealed(_companyId: string): Promise<SealedRecord[]> {
        const credential: PluggyCredential | null = await this.credentials.find();
        return credential === null ? [] : [{ id: credential.id, sealed: credential.sealed }];
    }

    public async replaceSealed(_companyId: string, id: string, sealed: string): Promise<void> {
        await this.credentials.replaceSealed(id, sealed, this.sealer.driver);
    }
}
