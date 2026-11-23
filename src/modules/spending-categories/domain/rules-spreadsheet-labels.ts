import { AppLocale } from '../../../shared/i18n/locale';

export interface RulesSpreadsheetLabels {
    readonly sheet: string;
    readonly headers: {
        readonly label: string;
        readonly matchType: string;
        readonly pattern: string;
        readonly appliesTo: string;
        readonly category: string;
    };
    readonly matchTypes: Readonly<Record<string, string>>;
    readonly directions: Readonly<Record<string, string>>;
}

export const RULES_SPREADSHEET_LABELS: Readonly<Record<AppLocale, RulesSpreadsheetLabels>> = {
    'pt-BR': {
        sheet: 'Regras de categoria',
        headers: { label: 'Regra', matchType: 'Tipo de correspondência', pattern: 'Texto', appliesTo: 'Vale para', category: 'Categoria' },
        matchTypes: { counterparty: 'Favorecido', description: 'Descrição igual', contains: 'Descrição contém' },
        directions: { out: 'Saídas', in: 'Entradas', any: 'Entradas e saídas' }
    },
    en: {
        sheet: 'Category rules',
        headers: { label: 'Rule', matchType: 'Match type', pattern: 'Text', appliesTo: 'Applies to', category: 'Category' },
        matchTypes: { counterparty: 'Counterparty', description: 'Description equals', contains: 'Description contains' },
        directions: { out: 'Outgoing', in: 'Incoming', any: 'Incoming and outgoing' }
    }
};
