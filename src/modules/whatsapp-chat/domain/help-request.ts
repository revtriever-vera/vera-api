import { plainOf } from './text-normalizer';

const WORDS: ReadonlySet<string> = new Set(['ajuda', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'help', 'hi', 'hello']);

export function isHelpRequest(text: string): boolean {
    return WORDS.has(plainOf(text));
}
