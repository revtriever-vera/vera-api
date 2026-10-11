import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { PluggyCredentialsDomain } from '../domain/pluggy-credentials.domain';

export const PLUGGY_CREDENTIALS_ERASE_AREA: string = 'pluggy_credentials';

@Injectable()
export class PluggyCredentialsEraser extends AccountDataEraserPort {
    public readonly area: string = PLUGGY_CREDENTIALS_ERASE_AREA;

    public constructor(private readonly credentials: PluggyCredentialsDomain) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.credentials.eraseAll();
    }
}
