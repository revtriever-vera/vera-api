import { AppLocale } from '../../../shared/i18n/locale';
import { LocalParts, localPartsIn, timeLabelOf, parseTimeOfDay, TimeOfDay } from './schedule';
import { REMINDER_KINDS, Reminder } from './reminders.types';

export type ReminderTexts = {
    readonly created: (text: string, when: string) => string;
    readonly listHeader: string;
    readonly listEmpty: string;
    readonly listItem: (position: number, text: string, when: string) => string;
    readonly deleted: (text: string) => string;
    readonly positionNotFound: (position: number) => string;
    readonly limitReached: (limit: number) => string;
    readonly summaryCreate: (text: string, when: string) => string;
    readonly summaryDelete: (text: string) => string;
    readonly fire: (text: string) => string;
    readonly buttons: { readonly done: string; readonly snooze1h: string; readonly tomorrow: string };
    readonly tapDone: string;
    readonly tapSnooze: string;
    readonly tapTomorrow: (time: string) => string;
    readonly tapGone: string;
    readonly tapHandled: string;
    readonly monthly: (day: number, time: string) => string;
    readonly onceToday: (time: string) => string;
    readonly onceTomorrow: (time: string) => string;
    readonly onceOn: (date: string, time: string) => string;
};

const PT_BR: ReminderTexts = {
    created: (text: string, when: string): string => `Lembrete criado: ${text}, ${when}. Para ver ou apagar, mande "meus lembretes".`,
    listHeader: 'Seus lembretes:',
    listEmpty: 'Você não tem lembretes. É só pedir: "me lembra de aportar todo dia 5".',
    listItem: (position: number, text: string, when: string): string => `${String(position)}. ${text}, ${when}`,
    deleted: (text: string): string => `Lembrete apagado: ${text}.`,
    positionNotFound: (position: number): string => `Não achei o lembrete ${String(position)}. Mande "meus lembretes" para ver a lista.`,
    limitReached: (limit: number): string => `Você já tem ${String(limit)} lembretes. Apague algum em "meus lembretes".`,
    summaryCreate: (text: string, when: string): string => `Criar o lembrete "${text}", ${when}?`,
    summaryDelete: (text: string): string => `Apagar o lembrete "${text}"?`,
    fire: (text: string): string => `Lembrete: ${text}.`,
    buttons: { done: 'Feito', snooze1h: 'Adiar 1h', tomorrow: 'Amanhã' },
    tapDone: 'Anotado, lembrete concluído.',
    tapSnooze: 'Combinado, lembro de novo em 1 hora.',
    tapTomorrow: (time: string): string => `Combinado, lembro amanhã às ${time}.`,
    tapGone: 'Esse lembrete não existe mais.',
    tapHandled: 'Esse lembrete já foi tratado.',
    monthly: (day: number, time: string): string => `todo dia ${String(day)} às ${time}`,
    onceToday: (time: string): string => `hoje às ${time}`,
    onceTomorrow: (time: string): string => `amanhã às ${time}`,
    onceOn: (date: string, time: string): string => `dia ${date} às ${time}`
};

const EN: ReminderTexts = {
    created: (text: string, when: string): string => `Reminder created: ${text}, ${when}. To see or delete it, send "my reminders".`,
    listHeader: 'Your reminders:',
    listEmpty: 'You have no reminders. Just ask: "remind me to invest on the 5th of every month".',
    listItem: (position: number, text: string, when: string): string => `${String(position)}. ${text}, ${when}`,
    deleted: (text: string): string => `Reminder deleted: ${text}.`,
    positionNotFound: (position: number): string => `I could not find reminder ${String(position)}. Send "my reminders" to see the list.`,
    limitReached: (limit: number): string => `You already have ${String(limit)} reminders. Delete some in "my reminders".`,
    summaryCreate: (text: string, when: string): string => `Create the reminder "${text}", ${when}?`,
    summaryDelete: (text: string): string => `Delete the reminder "${text}"?`,
    fire: (text: string): string => `Reminder: ${text}.`,
    buttons: { done: 'Done', snooze1h: 'Snooze 1h', tomorrow: 'Tomorrow' },
    tapDone: 'Noted, reminder completed.',
    tapSnooze: 'Done, I will remind you again in 1 hour.',
    tapTomorrow: (time: string): string => `Done, I will remind you tomorrow at ${time}.`,
    tapGone: 'That reminder no longer exists.',
    tapHandled: 'That reminder was already handled.',
    monthly: (day: number, time: string): string => `every month on day ${String(day)} at ${time}`,
    onceToday: (time: string): string => `today at ${time}`,
    onceTomorrow: (time: string): string => `tomorrow at ${time}`,
    onceOn: (date: string, time: string): string => `on ${date} at ${time}`
};

const TEXTS: Readonly<Record<AppLocale, ReminderTexts>> = { 'pt-BR': PT_BR, en: EN };

export function reminderTextsFor(locale: AppLocale): ReminderTexts {
    return TEXTS[locale];
}

export type WhenSubject = Pick<Reminder, 'kind' | 'onceAt' | 'dayOfMonth' | 'timeOfDay' | 'timezone'>;

function dayIndexOf(parts: LocalParts): number {
    return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function dateLabelOf(parts: LocalParts, locale: AppLocale): string {
    const day: string = String(parts.day).padStart(2, '0');
    const month: string = String(parts.month).padStart(2, '0');
    return locale === 'pt-BR' ? `${day}/${month}` : `${month}/${day}`;
}

function onceWhen(subject: OnceWhen, locale: AppLocale, now: Date): string {
    const texts: ReminderTexts = reminderTextsFor(locale);
    const at: LocalParts = localPartsIn(subject.timezone, subject.at);
    const time: string = timeLabelOf({ hour: at.hour, minute: at.minute });
    const gap: number = dayIndexOf(at) - dayIndexOf(localPartsIn(subject.timezone, now));
    if (gap === 0) {
        return texts.onceToday(time);
    }
    return gap === 1 ? texts.onceTomorrow(time) : texts.onceOn(dateLabelOf(at, locale), time);
}

type OnceWhen = { readonly timezone: string; readonly at: Date };

export function whenOf(subject: WhenSubject, locale: AppLocale, now: Date = new Date()): string {
    if (subject.kind === REMINDER_KINDS.monthly) {
        const time: TimeOfDay | null = parseTimeOfDay(subject.timeOfDay);
        return reminderTextsFor(locale).monthly(subject.dayOfMonth ?? 1, time === null ? subject.timeOfDay : timeLabelOf(time));
    }
    return onceWhen({ timezone: subject.timezone, at: subject.onceAt ?? now }, locale, now);
}
