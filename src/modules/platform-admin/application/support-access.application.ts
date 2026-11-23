import { Injectable } from '@nestjs/common';
import { SupportAccessItem, SupportAccessService } from '../../identity/services/support-access.service';
import { SupportAccessListView } from '../validation/platform-accounts.schemas';

@Injectable()
export class SupportAccessApplication {
    public constructor(private readonly access: SupportAccessService) {}

    public async list(): Promise<SupportAccessListView> {
        const items: SupportAccessItem[] = await this.access.listForCurrentAccount();
        return {
            items: items.map((item: SupportAccessItem) => ({
                id: item.id,
                at: item.at.toISOString(),
                operatorName: item.operatorName,
                reason: item.reason,
                layers: [...item.layers]
            }))
        };
    }
}
