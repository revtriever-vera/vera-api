import { AppLocale } from '../../../shared/i18n/locale';

export interface RemindersSpreadsheetLabels {
    readonly sheet: string;
    readonly headers: {
        readonly text: string;
        readonly when: string;
        readonly status: string;
        readonly nextAt: string;
        readonly createdAt: string;
    };
    readonly statuses: Readonly<Record<string, string>>;
}

export const REMINDERS_SPREADSHEET_LABELS: Readonly<Record<AppLocale, RemindersSpreadsheetLabels>> = {
    'pt-BR': {
        sheet: 'Lembretes',
        headers: { text: 'Lembrete', when: 'Quando', status: 'Situação', nextAt: 'Próximo aviso', createdAt: 'Criado em' },
        statuses: { active: 'Ativo', done: 'Concluído', canceled: 'Cancelado' }
    },
    en: {
        sheet: 'Reminders',
        headers: { text: 'Reminder', when: 'When', status: 'Status', nextAt: 'Next reminder', createdAt: 'Created on' },
        statuses: { active: 'Active', done: 'Done', canceled: 'Canceled' }
    }
};
