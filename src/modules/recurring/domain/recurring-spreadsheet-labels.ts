import { AppLocale } from '../../../shared/i18n/locale';

export interface RecurringSpreadsheetLabels {
    readonly sheet: string;
    readonly headers: readonly [
        name: string,
        kind: string,
        cadence: string,
        day: string,
        amount: string,
        valueMode: string,
        status: string,
        monthly: string,
        account: string
    ];
    readonly kinds: Readonly<Record<string, string>>;
    readonly cadences: Readonly<Record<string, string>>;
    readonly valueModes: Readonly<Record<string, string>>;
    readonly statuses: Readonly<Record<string, string>>;
}

export const RECURRING_SPREADSHEET_LABELS: Readonly<Record<AppLocale, RecurringSpreadsheetLabels>> = {
    'pt-BR': {
        sheet: 'Assinaturas e contas',
        headers: ['Nome', 'Tipo', 'Cadência', 'Dia', 'Valor', 'Valor fixo ou variável', 'Situação', 'Equivalente mensal', 'Conta'],
        kinds: { subscription: 'Assinatura', bill: 'Conta', other: 'Outra' },
        cadences: {
            weekly: 'Semanal',
            biweekly: 'Quinzenal',
            monthly: 'Mensal',
            bimonthly: 'Bimestral',
            quarterly: 'Trimestral',
            semiannual: 'Semestral',
            annual: 'Anual'
        },
        valueModes: { fixed: 'Fixo', variable: 'Variável' },
        statuses: { suggested: 'Para revisar', confirmed: 'Confirmada', dismissed: 'Descartada', stopped: 'Parada' }
    },
    en: {
        sheet: 'Subscriptions and bills',
        headers: ['Name', 'Type', 'Cadence', 'Day', 'Amount', 'Fixed or variable amount', 'Status', 'Monthly equivalent', 'Account'],
        kinds: { subscription: 'Subscription', bill: 'Bill', other: 'Other' },
        cadences: {
            weekly: 'Weekly',
            biweekly: 'Every two weeks',
            monthly: 'Monthly',
            bimonthly: 'Every two months',
            quarterly: 'Quarterly',
            semiannual: 'Every six months',
            annual: 'Yearly'
        },
        valueModes: { fixed: 'Fixed', variable: 'Variable' },
        statuses: { suggested: 'To review', confirmed: 'Confirmed', dismissed: 'Dismissed', stopped: 'Stopped' }
    }
};
