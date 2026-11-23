import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { PaidUsageHistoryService } from '../../../core/usage/services/paid-usage-history.service';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';

export const USAGE_ERASE_AREA: string = 'usage';

@Injectable()
export class UsageAccountEraser extends AccountDataEraserPort {
    public readonly area: string = USAGE_ERASE_AREA;

    public constructor(private readonly history: PaidUsageHistoryService) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.history.eraseAll();
    }
}
