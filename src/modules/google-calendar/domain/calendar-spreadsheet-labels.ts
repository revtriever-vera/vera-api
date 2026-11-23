import { AppLocale } from '../../../shared/i18n/locale';

export interface CalendarSpreadsheetLabels {
    readonly sheet: string;
    readonly headers: {
        readonly email: string;
        readonly status: string;
        readonly access: string;
        readonly connectedAt: string;
        readonly disconnectedAt: string;
    };
    readonly statuses: Readonly<Record<string, string>>;
    readonly accesses: Readonly<Record<string, string>>;
}

export const CALENDAR_SPREADSHEET_LABELS: Readonly<Record<AppLocale, CalendarSpreadsheetLabels>> = {
    'pt-BR': {
        sheet: 'Google Agenda',
        headers: {
            email: 'Conta Google',
            status: 'Situação',
            access: 'Permissão',
            connectedAt: 'Conectado em',
            disconnectedAt: 'Desconectado em'
        },
        statuses: { active: 'Conectado', disconnected: 'Desconectado', revoked: 'Revogado no Google' },
        accesses: { read_write: 'Ver e editar eventos', read_only: 'Só leitura' }
    },
    en: {
        sheet: 'Google Calendar',
        headers: {
            email: 'Google account',
            status: 'Status',
            access: 'Permission',
            connectedAt: 'Connected on',
            disconnectedAt: 'Disconnected on'
        },
        statuses: { active: 'Connected', disconnected: 'Disconnected', revoked: 'Revoked at Google' },
        accesses: { read_write: 'View and edit events', read_only: 'Read only' }
    }
};
