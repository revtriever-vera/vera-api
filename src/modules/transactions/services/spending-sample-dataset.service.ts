import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { DatasetAccount, SpendingDataset } from '../domain/spending-dataset';
import { SpendingDatasetService } from './spending-dataset.service';

export const SAMPLE_ACCOUNT_NAMES: Readonly<Record<AppLocale, Readonly<Record<string, string>>>> = {
    'pt-BR': {
        'nubank-card': 'Cartão de exemplo',
        'nubank-checking': 'Conta de exemplo',
        'itau-checking': 'Conta 2 de exemplo'
    },
    en: {
        'nubank-card': 'Sample card',
        'nubank-checking': 'Sample account',
        'itau-checking': 'Sample account 2'
    }
};

@Injectable()
export class SpendingSampleDatasetService {
    public constructor(
        private readonly dataset: SpendingDatasetService,
        private readonly context: AppContext
    ) {}

    public build(today: string): SpendingDataset {
        const names: Readonly<Record<string, string>> = SAMPLE_ACCOUNT_NAMES[this.context.get().locale];
        const base: SpendingDataset = this.dataset.build(today);
        return {
            ...base,
            accounts: base.accounts.map((account: DatasetAccount): DatasetAccount => ({
                ...account,
                name: names[account.key] ?? account.name
            }))
        };
    }
}
