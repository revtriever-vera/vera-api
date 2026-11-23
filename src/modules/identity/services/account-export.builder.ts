import { Injectable } from '@nestjs/common';
import { ACCOUNT_EXPORT_FORMAT } from '../domain/identity.types';
import { AccountDataRegistry } from './account-data.registry';
import { IdentityAccountExport, IdentityAccountExporter } from './identity-account.exporter';

export interface AccountExportFile {
    readonly format: string;
    readonly exportedAt: string;
    readonly account: IdentityAccountExport;
    readonly sections: Record<string, unknown>;
}

@Injectable()
export class AccountExportBuilder {
    public constructor(
        private readonly identityExporter: IdentityAccountExporter,
        private readonly registry: AccountDataRegistry
    ) {}

    public async build(companyId: string): Promise<AccountExportFile> {
        const account: IdentityAccountExport = await this.identityExporter.export();
        const sections: Record<string, unknown> = await this.registry.exportSections(companyId);
        return { format: ACCOUNT_EXPORT_FORMAT, exportedAt: new Date().toISOString(), account, sections };
    }
}
