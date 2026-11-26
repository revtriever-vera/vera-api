import { AppLocale } from '../../../shared/i18n/locale';
import { WatchDigestEntry } from '../validation/portfolio-watch.schemas';
import { WATCH_NOTICE_TYPES } from './portfolio-agenda.types';

const NO_BREAK_SPACE: string = String.fromCodePoint(0xa0);
const MAX_FRACTION_DIGITS: number = 8;

export interface WatchDigestLine {
    readonly text: string;
    readonly documentUrl: string | null;
}

export interface WatchDigestCopy {
    readonly subject: string;
    readonly title: string;
    readonly intro: string;
    readonly lines: readonly WatchDigestLine[];
    readonly footnote: string;
    readonly unsubscribeLabels: Readonly<Record<string, string>>;
}

interface Formatters {
    readonly amount: (entry: WatchDigestEntry) => string;
    readonly short: (isoDate: string) => string;
    readonly long: (isoDate: string) => string;
}

interface LocaleTexts {
    readonly subjectOne: string;
    readonly subjectMany: (count: number) => string;
    readonly title: string;
    readonly intro: string;
    readonly footnote: string;
    readonly unsubscribeLabels: Readonly<Record<string, string>>;
    readonly line: (entry: WatchDigestEntry, format: Formatters) => string;
}

function amountSuffix(entry: WatchDigestEntry, format: Formatters, per: string): string {
    return entry.amountPerUnit === '' ? '' : `: ${format.amount(entry)} ${per}`;
}

function exDateLine(entry: WatchDigestEntry, format: Formatters, texts: { head: string; per: string; pay: string }): string {
    const amount: string = amountSuffix(entry, format, texts.per);
    const payment: string = entry.paymentDate === '' ? '' : ` ${texts.pay} ${format.short(entry.paymentDate)}.`;
    return `${texts.head} ${entry.name}${amount}.${payment}`;
}

const TEXTS: Readonly<Record<AppLocale, LocaleTexts>> = {
    'pt-BR': {
        subjectOne: '1 aviso da sua carteira hoje',
        subjectMany: (count: number): string => `${String(count)} avisos da sua carteira hoje`,
        title: 'Agenda da sua carteira',
        intro: 'A Vera conferiu a sua carteira. Hoje tem isto:',
        footnote: 'As datas e os valores vêm dos avisos publicados e dos seus cadastros. Podem mudar.',
        unsubscribeLabels: {
            [WATCH_NOTICE_TYPES.exDateTomorrow]: 'avisos de data-com',
            [WATCH_NOTICE_TYPES.paymentToday]: 'avisos de pagamento',
            [WATCH_NOTICE_TYPES.assemblySoon]: 'avisos de assembleia',
            [WATCH_NOTICE_TYPES.fixedIncomeMaturitySoon]: 'avisos de vencimento'
        },
        line: (entry: WatchDigestEntry, format: Formatters): string => {
            if (entry.type === WATCH_NOTICE_TYPES.exDateTomorrow) {
                return exDateLine(entry, format, { head: 'Amanhã é a data-com de', per: 'por cota', pay: 'Pagamento em' });
            }
            if (entry.type === WATCH_NOTICE_TYPES.paymentToday) {
                return `Hoje é o pagamento de ${entry.name}${amountSuffix(entry, format, 'por cota')}.`;
            }
            if (entry.type === WATCH_NOTICE_TYPES.assemblySoon) {
                return `Em ${String(entry.days)} dias, em ${format.short(entry.date)}, tem assembleia de ${entry.name}.`;
            }
            return `${entry.name} vence em ${String(entry.days)} dias, em ${format.long(entry.date)}.`;
        }
    },
    en: {
        subjectOne: '1 notice about your portfolio today',
        subjectMany: (count: number): string => `${String(count)} notices about your portfolio today`,
        title: 'Your portfolio agenda',
        intro: 'Vera checked your portfolio. Today there is this:',
        footnote: 'Dates and amounts come from the published notices and from your records. They can change.',
        unsubscribeLabels: {
            [WATCH_NOTICE_TYPES.exDateTomorrow]: 'ex-date notices',
            [WATCH_NOTICE_TYPES.paymentToday]: 'payment notices',
            [WATCH_NOTICE_TYPES.assemblySoon]: 'assembly notices',
            [WATCH_NOTICE_TYPES.fixedIncomeMaturitySoon]: 'maturity notices'
        },
        line: (entry: WatchDigestEntry, format: Formatters): string => {
            if (entry.type === WATCH_NOTICE_TYPES.exDateTomorrow) {
                return exDateLine(entry, format, { head: 'Tomorrow is the ex-date of', per: 'per share', pay: 'Payment on' });
            }
            if (entry.type === WATCH_NOTICE_TYPES.paymentToday) {
                return `Today is the payment of ${entry.name}${amountSuffix(entry, format, 'per share')}.`;
            }
            if (entry.type === WATCH_NOTICE_TYPES.assemblySoon) {
                return `In ${String(entry.days)} days, on ${format.short(entry.date)}, there is an assembly of ${entry.name}.`;
            }
            return `${entry.name} matures in ${String(entry.days)} days, on ${format.long(entry.date)}.`;
        }
    }
};

const DATE_OPTIONS: Readonly<Record<AppLocale, { short: Intl.DateTimeFormatOptions; long: Intl.DateTimeFormatOptions }>> = {
    'pt-BR': {
        short: { day: '2-digit', month: '2-digit', timeZone: 'UTC' },
        long: { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }
    },
    en: {
        short: { day: 'numeric', month: 'short', timeZone: 'UTC' },
        long: { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
    }
};

function formattersOf(locale: AppLocale): Formatters {
    const short: Intl.DateTimeFormat = new Intl.DateTimeFormat(locale, DATE_OPTIONS[locale].short);
    const long: Intl.DateTimeFormat = new Intl.DateTimeFormat(locale, DATE_OPTIONS[locale].long);
    return {
        amount: (entry: WatchDigestEntry): string =>
            new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: entry.currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: MAX_FRACTION_DIGITS
            })
                .format(Number(entry.amountPerUnit))
                .replaceAll(NO_BREAK_SPACE, ' '),
        short: (isoDate: string): string => short.format(new Date(`${isoDate}T00:00:00Z`)),
        long: (isoDate: string): string => long.format(new Date(`${isoDate}T00:00:00Z`))
    };
}

export function watchDigestCopy(entries: readonly WatchDigestEntry[], locale: AppLocale): WatchDigestCopy {
    const texts: LocaleTexts = TEXTS[locale];
    const format: Formatters = formattersOf(locale);
    return {
        subject: entries.length === 1 ? texts.subjectOne : texts.subjectMany(entries.length),
        title: texts.title,
        intro: texts.intro,
        lines: entries.map((entry: WatchDigestEntry): WatchDigestLine => ({
            text: texts.line(entry, format),
            documentUrl: entry.documentUrl.startsWith('https://') ? entry.documentUrl : null
        })),
        footnote: texts.footnote,
        unsubscribeLabels: texts.unsubscribeLabels
    };
}
