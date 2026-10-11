import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { UnauthorizedError } from '../domain/identity.errors';
import { ACCOUNT_EXPORT_FORMAT, ACCOUNT_EXPORT_OUTCOMES } from '../domain/identity.types';
import { AccountDataRegistry } from '../services/account-data.registry';
import { IdentityAccountExport, IdentityAccountExporter } from '../services/identity-account.exporter';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';

const EXPORT_LIMIT: number = 3;
const EXPORT_WINDOW_SECONDS: number = 60 * 60;

export interface AccountExportFile {
    readonly format: string;
    readonly exportedAt: string;
    readonly account: IdentityAccountExport;
    readonly sections: Record<string, unknown>;
}

@Injectable()
export class AccountExportApplication {
    public constructor(
        private readonly throttle: ThrottleService,
        private readonly identityExporter: IdentityAccountExporter,
        private readonly registry: AccountDataRegistry,
        private readonly logs: IdentityLogService,
        private readonly metrics: IdentityMetricsService,
        private readonly context: AppContext
    ) {}

    public async export(): Promise<AccountExportFile> {
        const { userId, companyId } = this.context.get();
        if (userId === undefined || companyId === undefined) {
            throw new UnauthorizedError();
        }
        await this.throttle.assertAllowed(`account-export:${userId}`, EXPORT_LIMIT, EXPORT_WINDOW_SECONDS);
        try {
            const file: AccountExportFile = await this.build(companyId);
            this.logs.exportRequested(Object.keys(file.sections));
            this.metrics.accountExport(ACCOUNT_EXPORT_OUTCOMES.success);
            return file;
        } catch (error: unknown) {
            this.metrics.accountExport(ACCOUNT_EXPORT_OUTCOMES.failed);
            throw error;
        }
    }

    private async build(companyId: string): Promise<AccountExportFile> {
        const account: IdentityAccountExport = await this.identityExporter.export();
        const sections: Record<string, unknown> = await this.registry.exportSections(companyId);
        return { format: ACCOUNT_EXPORT_FORMAT, exportedAt: new Date().toISOString(), account, sections };
    }
}
