import { Injectable } from '@nestjs/common';
import { buildSpendingDataset, DatasetAccount, DatasetTransaction, SpendingDataset } from '../domain/spending-dataset';

export type { DatasetAccount, DatasetTransaction, SpendingDataset };

@Injectable()
export class SpendingDatasetService {
    public build(today: string): SpendingDataset {
        return buildSpendingDataset(today);
    }
}
