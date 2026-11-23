import { AppLocale } from '../../../shared/i18n/locale';

export interface AllocationSpreadsheetLabels {
    readonly classes: { readonly sheet: string; readonly name: string; readonly target: string };
    readonly assets: {
        readonly sheet: string;
        readonly kind: string;
        readonly asset: string;
        readonly className: string;
        readonly target: string;
    };
    readonly settings: {
        readonly sheet: string;
        readonly setting: string;
        readonly value: string;
        readonly baseCurrency: string;
        readonly tolerance: string;
    };
    readonly subjectTypes: Readonly<Record<string, string>>;
}

export const ALLOCATION_SPREADSHEET_LABELS: Readonly<Record<AppLocale, AllocationSpreadsheetLabels>> = {
    'pt-BR': {
        classes: { sheet: 'Classes', name: 'Classe', target: 'Meta da classe' },
        assets: {
            sheet: 'Metas por ativo',
            kind: 'Tipo',
            asset: 'Identificador do ativo',
            className: 'Classe',
            target: 'Meta dentro da classe'
        },
        settings: { sheet: 'Preferências', setting: 'Preferência', value: 'Valor', baseCurrency: 'Moeda base', tolerance: 'Tolerância' },
        subjectTypes: { position: 'Posição', fixed_income: 'Renda fixa' }
    },
    en: {
        classes: { sheet: 'Classes', name: 'Class', target: 'Class target' },
        assets: { sheet: 'Asset targets', kind: 'Type', asset: 'Asset identifier', className: 'Class', target: 'Target within class' },
        settings: { sheet: 'Settings', setting: 'Setting', value: 'Value', baseCurrency: 'Base currency', tolerance: 'Tolerance' },
        subjectTypes: { position: 'Position', fixed_income: 'Fixed income' }
    }
};
