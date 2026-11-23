import { Tap } from './whatsapp-chat.types';
import { plainOf } from './text-normalizer';

const YES: ReadonlySet<string> = new Set(['sim', 'yes']);
const NO: ReadonlySet<string> = new Set(['nao', 'no']);

export function typedConfirmationOf(text: string): Tap | null {
    const word: string = plainOf(text);
    if (YES.has(word)) {
        return 'yes';
    }
    return NO.has(word) ? 'no' : null;
}
