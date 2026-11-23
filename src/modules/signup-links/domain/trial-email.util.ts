const GMAIL_DOMAINS: ReadonlySet<string> = new Set(['gmail.com', 'googlemail.com']);
const CANONICAL_GMAIL_DOMAIN: string = 'gmail.com';

export class TrialEmailUtil {
    public static canonical(email: string): string {
        const lowered: string = email.trim().toLowerCase();
        const at: number = lowered.lastIndexOf('@');
        if (at < 1) {
            return lowered;
        }
        const local: string = lowered.slice(0, at);
        const domain: string = lowered.slice(at + 1);
        if (!GMAIL_DOMAINS.has(domain)) {
            return lowered;
        }
        const withoutTag: string = local.split('+')[0] ?? local;
        return `${withoutTag.replaceAll('.', '')}@${CANONICAL_GMAIL_DOMAIN}`;
    }
}
