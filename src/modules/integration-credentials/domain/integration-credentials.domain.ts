import { Injectable } from '@nestjs/common';
import { isUniqueViolationError } from '../../../core/database/database.errors';
import { IntegrationCredentialsRepository } from '../repositories/integration-credentials.repository';
import { PhoneNumberInUseError } from './integration-credentials.errors';
import { IntegrationCredential, IntegrationKind, KindCount, SealedIntegration } from './integration.types';

const PHONE_INDEX: string = 'IntegrationCredentials_phone_number_unique';

@Injectable()
export class IntegrationCredentialsDomain {
    public constructor(private readonly credentials: IntegrationCredentialsRepository) {}

    public async find(kind: IntegrationKind): Promise<IntegrationCredential | null> {
        return this.credentials.findByKind(kind);
    }

    public async list(): Promise<IntegrationCredential[]> {
        return this.credentials.listAll();
    }

    public async replace(data: SealedIntegration): Promise<IntegrationCredential> {
        try {
            return await this.credentials.replaceCurrent(data);
        } catch (error: unknown) {
            if (isUniqueViolationError(error, PHONE_INDEX)) {
                throw new PhoneNumberInUseError();
            }
            throw error;
        }
    }

    public async remove(kind: IntegrationKind): Promise<number> {
        return this.credentials.eraseKind(kind);
    }

    public async eraseAll(): Promise<number> {
        return this.credentials.eraseAll();
    }

    public async replaceSealed(id: string, sealed: string, sealerDriver: string): Promise<void> {
        await this.credentials.replaceSealed(id, sealed, sealerDriver);
    }

    public async findCompanyByPhoneNumberIdAcrossTenants(phoneNumberId: string): Promise<string | null> {
        const row: IntegrationCredential | null = await this.credentials.findByPhoneNumberIdAcrossTenants(phoneNumberId);
        return row?.companyId ?? null;
    }

    public async listCompanyIds(): Promise<string[]> {
        return this.credentials.listCompanyIdsAcrossTenants();
    }

    public async countByKind(): Promise<KindCount[]> {
        return this.credentials.countByKindAcrossTenants();
    }
}
