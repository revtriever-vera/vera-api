import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { DateUtil } from '../../../shared/utils/date.util';
import type { DigestEntry } from '../../notices/services/notice.service';
import {
    AGENDA_ASSEMBLY_KIND,
    AGENDA_FIXED_INCOME_MATURITY,
    isIncomeKind,
    AGENDA_TREASURY_MATURITY,
    AgendaItem,
    ASSEMBLY_NOTICE_DAYS,
    MATURITY_NOTICE_DAYS,
    WATCH_NOTICE_TYPES
} from './portfolio-agenda.types';

export function addDaysTo(day: string, days: number): string {
    return DateUtil.onlyDateString(DateUtil.addDays(new Date(`${day}T00:00:00Z`), days));
}

function dataOf(item: AgendaItem, date: string, days: number): Record<string, string> {
    return {
        name: item.name,
        date,
        days: String(days),
        paymentDate: item.paymentDate ?? '',
        amountPerUnit: item.amountPerUnit ?? '',
        currency: item.currency,
        documentUrl: item.documentUrl ?? ''
    };
}

function entryOf(type: string, item: AgendaItem, date: string, days: number): DigestEntry {
    const owner: string = item.assetId ?? item.holdingId ?? item.id;
    return { type, key: `${type}:${owner}:${date}`, data: dataOf(item, date, days) };
}

function entriesOfItem(item: AgendaItem, today: string): DigestEntry[] {
    const entries: DigestEntry[] = [];
    const income: boolean = isIncomeKind(item.kind);
    if (income && item.exDate === addDaysTo(today, 1)) {
        entries.push(entryOf(WATCH_NOTICE_TYPES.exDateTomorrow, item, item.exDate, 1));
    }
    if (income && item.paymentDate === today) {
        entries.push(entryOf(WATCH_NOTICE_TYPES.paymentToday, item, today, 0));
    }
    if (item.kind === AGENDA_ASSEMBLY_KIND && item.eventDate === addDaysTo(today, ASSEMBLY_NOTICE_DAYS)) {
        entries.push(entryOf(WATCH_NOTICE_TYPES.assemblySoon, item, item.eventDate, ASSEMBLY_NOTICE_DAYS));
    }
    const maturity: boolean = item.kind === AGENDA_FIXED_INCOME_MATURITY || item.kind === AGENDA_TREASURY_MATURITY;
    if (maturity && item.date === addDaysTo(today, MATURITY_NOTICE_DAYS)) {
        entries.push(entryOf(WATCH_NOTICE_TYPES.fixedIncomeMaturitySoon, item, item.date, MATURITY_NOTICE_DAYS));
    }
    return entries;
}

function firstFilled(first: string | undefined, second: string | undefined): string {
    return first === undefined || first === '' ? (second ?? '') : first;
}

function mergedAmount(first: Record<string, string>, second: Record<string, string>): string {
    const bothFilled: boolean = (first['amountPerUnit'] ?? '') !== '' && (second['amountPerUnit'] ?? '') !== '';
    if (bothFilled && first['currency'] === second['currency']) {
        return DecimalUtil.of(first['amountPerUnit'] ?? '0')
            .add(second['amountPerUnit'] ?? '0')
            .toFixed();
    }
    return firstFilled(first['amountPerUnit'], second['amountPerUnit']);
}

function mergedData(first: Record<string, string>, second: Record<string, string>): Record<string, string> {
    return {
        ...first,
        amountPerUnit: mergedAmount(first, second),
        documentUrl: firstFilled(first['documentUrl'], second['documentUrl'])
    };
}

export function watchNoticeEntriesOf(items: readonly AgendaItem[], today: string): DigestEntry[] {
    const byKey: Map<string, DigestEntry> = new Map();
    for (const entry of items.flatMap((item: AgendaItem): DigestEntry[] => entriesOfItem(item, today))) {
        const previous: DigestEntry | undefined = byKey.get(entry.key);
        byKey.set(entry.key, previous === undefined ? entry : { ...previous, data: mergedData(previous.data, entry.data) });
    }
    return [...byKey.values()];
}
