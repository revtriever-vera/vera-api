import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { IntegrationCredentialsDomain } from '../domain/integration-credentials.domain';

export const INTEGRATION_CREDENTIALS_ERASE_AREA: string = 'integration_credentials';

@Injectable()
export class IntegrationAccountEraser extends AccountDataEraserPort {
    public readonly area: string = INTEGRATION_CREDENTIALS_ERASE_AREA;

    public constructor(private readonly credentials: IntegrationCredentialsDomain) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.credentials.eraseAll();
    }
}
