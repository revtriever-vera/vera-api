import { z } from 'zod';
import { alertSchema, entrySchema } from '../validation/notice-props.schemas';

export type WeekEntry = z.infer<typeof entrySchema>;
export type WeekAlert = z.infer<typeof alertSchema>;

export interface WeekProps {
    readonly totalMinor: number;
    readonly entries: readonly WeekEntry[];
    readonly alerts: readonly WeekAlert[];
}

export interface DueProps {
    readonly name: string;
    readonly amountMinor: number;
    readonly estimate: boolean;
    readonly card: boolean;
    readonly account: string;
    readonly lastDate: string;
}

export function weekPropsOf(entries: readonly WeekEntry[], alerts: readonly WeekAlert[]): Record<string, string> {
    const totalMinor: number = entries.reduce((sum: number, entry: WeekEntry): number => sum + entry.amountMinor, 0);
    return { totalMinor: String(totalMinor), entries: JSON.stringify(entries), alerts: JSON.stringify(alerts) };
}

export function weekFromProps(props: Readonly<Record<string, string>>): WeekProps {
    return {
        totalMinor: Number(props['totalMinor'] ?? 0),
        entries: parseList(props['entries'], entrySchema),
        alerts: parseList(props['alerts'], alertSchema)
    };
}

export function duePropsOf(due: DueProps): Record<string, string> {
    return {
        name: due.name,
        amountMinor: String(due.amountMinor),
        estimate: String(due.estimate),
        card: String(due.card),
        account: due.account,
        lastDate: due.lastDate
    };
}

export function dueFromProps(props: Readonly<Record<string, string>>): DueProps {
    return {
        name: props['name'] ?? '',
        amountMinor: Number(props['amountMinor'] ?? 0),
        estimate: props['estimate'] === 'true',
        card: props['card'] === 'true',
        account: props['account'] ?? '',
        lastDate: props['lastDate'] ?? ''
    };
}

function parseList<T>(raw: string | undefined, schema: z.ZodType<T>): T[] {
    try {
        const parsed: z.SafeParseReturnType<unknown, T[]> = z.array(schema).safeParse(JSON.parse(raw ?? '[]'));
        return parsed.success ? parsed.data : [];
    } catch {
        return [];
    }
}
