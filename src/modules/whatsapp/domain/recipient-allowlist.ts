const ANY_RECIPIENT: string = '*';

export function isRecipientAllowed(allowed: readonly string[], peer: string): boolean {
    if (allowed.includes(ANY_RECIPIENT)) {
        return true;
    }
    return allowed.includes(peer.replaceAll(/\D/g, ''));
}
