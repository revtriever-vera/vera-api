import { AppLocale } from '../../../shared/i18n/locale';

export interface GoalsSpreadsheetLabels {
    readonly goals: {
        readonly sheet: string;
        readonly name: string;
        readonly kind: string;
        readonly target: string;
        readonly date: string;
        readonly balance: string;
        readonly status: string;
        readonly holder: string;
    };
    readonly links: { readonly sheet: string; readonly goal: string; readonly asset: string; readonly share: string };
    readonly wholeAccount: string;
    readonly kinds: Readonly<Record<string, string>>;
    readonly statuses: Readonly<Record<string, string>>;
}

export const GOALS_SPREADSHEET_LABELS: Readonly<Record<AppLocale, GoalsSpreadsheetLabels>> = {
    'pt-BR': {
        goals: {
            sheet: 'Objetivos',
            name: 'Objetivo',
            kind: 'Tipo',
            target: 'Valor',
            date: 'Data',
            balance: 'Saldo',
            status: 'Situação',
            holder: 'Titular'
        },
        links: { sheet: 'Objetivos · ativos', goal: 'Objetivo', asset: 'Ativo', share: 'Parte' },
        wholeAccount: 'Conta toda',
        kinds: { emergency_reserve: 'Reserva de emergência', travel: 'Viagem', home_down_payment: 'Entrada do imóvel', other: 'Outro' },
        statuses: { done: 'Concluído', on_track: 'Em dia', behind: 'Atrasado', overdue: 'Prazo vencido' }
    },
    en: {
        goals: {
            sheet: 'Goals',
            name: 'Goal',
            kind: 'Type',
            target: 'Target',
            date: 'Date',
            balance: 'Balance',
            status: 'Status',
            holder: 'Holder'
        },
        links: { sheet: 'Goals · assets', goal: 'Goal', asset: 'Asset', share: 'Share' },
        wholeAccount: 'Whole account',
        kinds: { emergency_reserve: 'Emergency reserve', travel: 'Travel', home_down_payment: 'Home down payment', other: 'Other' },
        statuses: { done: 'Done', on_track: 'On track', behind: 'Behind', overdue: 'Past due' }
    }
};
