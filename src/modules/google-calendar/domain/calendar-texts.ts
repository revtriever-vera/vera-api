import { AppLocale } from '../../../shared/i18n/locale';
import { LocalParts, localPartsIn } from './local-time';

const WEEKDAYS: Readonly<Record<AppLocale, readonly string[]>> = {
    'pt-BR': ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

export function dayOf(at: Date, timeZone: string, locale: AppLocale): string {
    const parts: LocalParts = localPartsIn(timeZone, at);
    const weekday: string = WEEKDAYS[locale][parts.weekday] ?? '';
    return locale === 'pt-BR' ? `${weekday} ${pad(parts.day)}/${pad(parts.month)}` : `${weekday} ${pad(parts.month)}/${pad(parts.day)}`;
}

export function hourOf(at: Date, timeZone: string): string {
    const parts: LocalParts = localPartsIn(timeZone, at);
    return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export interface CalendarLine {
    readonly title: string;
    readonly start: Date;
    readonly allDay: boolean;
}

export interface CalendarTexts {
    readonly notConnected: string;
    readonly unavailable: string;
    readonly readOnly: string;
    readonly noEvents: string;
    readonly eventsHeader: string;
    readonly canceled: string;
    readonly needsTime: string;
    eventLine(line: CalendarLine, timeZone: string): string;
    summaryCreate(title: string, start: Date, timeZone: string): string;
    created(title: string, start: Date, timeZone: string): string;
    past: string;
}

const PT: CalendarTexts = {
    notConnected:
        'Para criar e listar reuniões, conecte o Google Agenda em Configurações › Google Agenda. A permissão é pedida só para isso.',
    unavailable: 'Não consegui falar com o Google Agenda agora. Tente de novo em instantes.',
    readOnly: 'Seu Google Agenda está só para leitura: eu listo os compromissos, mas não crio reuniões.',
    noEvents: 'Você não tem compromissos nos próximos dias.',
    eventsHeader: 'Seus próximos compromissos:',
    canceled: 'Reunião não criada.',
    needsTime: 'Em que dia e horário será a reunião?',
    past: 'Esse horário já passou. Me diga uma data futura.',
    eventLine: (line: CalendarLine, timeZone: string): string =>
        line.allDay
            ? `• ${dayOf(line.start, 'UTC', 'pt-BR')}: ${line.title}`
            : `• ${dayOf(line.start, timeZone, 'pt-BR')}, ${hourOf(line.start, timeZone)}: ${line.title}`,
    summaryCreate: (title: string, start: Date, timeZone: string): string =>
        `Criar a reunião "${title}" no Google Agenda, ${dayOf(start, timeZone, 'pt-BR')} às ${hourOf(start, timeZone)}?`,
    created: (title: string, start: Date, timeZone: string): string =>
        `Reunião criada no Google Agenda: ${title}, ${dayOf(start, timeZone, 'pt-BR')} às ${hourOf(start, timeZone)}.`
};

const EN: CalendarTexts = {
    notConnected:
        'To create and list meetings, connect Google Calendar in Settings › Google Calendar. The permission is asked only for that.',
    unavailable: 'I could not reach Google Calendar right now. Try again in a moment.',
    readOnly: 'Your Google Calendar is read-only: I list your events, but I do not create meetings.',
    noEvents: 'You have no events in the next days.',
    eventsHeader: 'Your upcoming events:',
    canceled: 'Meeting not created.',
    needsTime: 'On which day and at what time is the meeting?',
    past: 'That time has already passed. Tell me a future date.',
    eventLine: (line: CalendarLine, timeZone: string): string =>
        line.allDay
            ? `• ${dayOf(line.start, 'UTC', 'en')}: ${line.title}`
            : `• ${dayOf(line.start, timeZone, 'en')}, ${hourOf(line.start, timeZone)}: ${line.title}`,
    summaryCreate: (title: string, start: Date, timeZone: string): string =>
        `Create the meeting "${title}" in Google Calendar, ${dayOf(start, timeZone, 'en')} at ${hourOf(start, timeZone)}?`,
    created: (title: string, start: Date, timeZone: string): string =>
        `Meeting created in Google Calendar: ${title}, ${dayOf(start, timeZone, 'en')} at ${hourOf(start, timeZone)}.`
};

export function calendarTextsFor(locale: AppLocale): CalendarTexts {
    return locale === 'pt-BR' ? PT : EN;
}
