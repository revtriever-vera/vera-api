import { Injectable } from '@nestjs/common';
import { buildSpendingDataset, SpendingDataset } from '../domain/spending-dataset';

export type { DatasetAccount, DatasetTransaction } from '../domain/spending-dataset';
export type { SpendingDataset };

@Injectable()
export class SpendingDatasetService {
    public build(today: string): SpendingDataset {
        return buildSpendingDataset(today);
    }
}
