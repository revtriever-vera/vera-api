import { stripTrailingPunctuation } from './text-normalizer';
import { UNLINK_REASONS, UnlinkReason } from './whatsapp-link.types';

const WORDS: Readonly<Record<string, UnlinkReason>> = {
    desvincular: UNLINK_REASONS.userChat,
    sair: UNLINK_REASONS.userChat,
    cancelar: UNLINK_REASONS.userChat,
    parar: UNLINK_REASONS.optOut,
    stop: UNLINK_REASONS.optOut
};

export function parseOptOut(text: string): UnlinkReason | null {
    const word: string = stripTrailingPunctuation(text.trim()).toLowerCase();
    return Object.hasOwn(WORDS, word) ? (WORDS[word] ?? null) : null;
}
