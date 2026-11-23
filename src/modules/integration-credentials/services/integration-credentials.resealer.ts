import { Injectable } from '@nestjs/common';
import { ResealableSecretsPort, SealedRecord } from '../../../core/crypto/resealable-secrets.port';
import { SecretSealerPort } from '../../../core/crypto/secret-sealer.port';
import { IntegrationCredentialsDomain } from '../domain/integration-credentials.domain';
import { INTEGRATION_CREDENTIALS_PURPOSE, IntegrationCredential } from '../domain/integration.types';

@Injectable()
export class IntegrationCredentialsResealer extends ResealableSecretsPort {
    public readonly purpose: string = INTEGRATION_CREDENTIALS_PURPOSE;

    public constructor(
        private readonly credentials: IntegrationCredentialsDomain,
        private readonly sealer: SecretSealerPort
    ) {
        super();
    }

    public async listCompanyIds(): Promise<string[]> {
        return this.credentials.listCompanyIds();
    }

    public async listSealed(_companyId: string): Promise<SealedRecord[]> {
        const rows: IntegrationCredential[] = await this.credentials.list();
        return rows.map((row: IntegrationCredential): SealedRecord => ({ id: row.id, sealed: row.sealed }));
    }

    public async replaceSealed(_companyId: string, id: string, sealed: string): Promise<void> {
        await this.credentials.replaceSealed(id, sealed, this.sealer.driver);
    }
}
