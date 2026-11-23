import { plainOf } from './text-normalizer';

export type ReminderCommand = { readonly kind: 'list' } | { readonly kind: 'delete'; readonly index: number };

const LIST_WORDS: ReadonlySet<string> = new Set(['meus lembretes', 'my reminders']);
const DELETE: RegExp = /^(?:apagar lembrete|delete reminder) (\d{1,3})$/;

export function parseReminderCommand(text: string): ReminderCommand | null {
    const plain: string = plainOf(text);
    if (LIST_WORDS.has(plain)) {
        return { kind: 'list' };
    }
    const index: string | undefined = DELETE.exec(plain)?.[1];
    return index === undefined ? null : { kind: 'delete', index: Number(index) };
}
