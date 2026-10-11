import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { OnboardingArea, OnboardingAreaSummary, OnboardingAreaSummaryPort } from '../../onboarding/services/onboarding-area-summary.port';
import { TransactionImportService } from '../../transactions/services/transaction-import.service';
import { BankConnectionReaderService } from './bank-connection-reader.service';

@Injectable()
export class BanksOnboardingSummary extends OnboardingAreaSummaryPort {
    public readonly area: OnboardingArea = 'banks';

    public constructor(
        private readonly connections: BankConnectionReaderService,
        private readonly imports: TransactionImportService
    ) {
        super();
    }

    @AsCompany()
    public async summarize(_companyId: string): Promise<OnboardingAreaSummary> {
        const connections: number = await this.connections.countConnected();
        const imports: number = await this.imports.countCompleted();
        return { items: connections + imports, amountCents: null, currency: null, breakdown: { connections, imports } };
    }
}
