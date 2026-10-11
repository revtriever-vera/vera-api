import { MailLogService } from './mail-log.service';
import { MailPort } from './mail.port';
import { Mail, MailReceipt } from './mail.types';

export const BLOCKED_PROVIDER: string = 'blocked-by-allowlist';
const EVERYONE: string = '*';

function domainOf(email: string): string {
    return email.slice(email.lastIndexOf('@'));
}

export class AllowlistMailPort extends MailPort {
    public constructor(
        private readonly driver: MailPort,
        private readonly allowed: readonly string[],
        private readonly logs: MailLogService
    ) {
        super();
    }

    public async send(mail: Mail): Promise<MailReceipt> {
        if (!this.allows(mail.to.email)) {
            this.logs.recipientBlocked(domainOf(mail.to.email));
            return { provider: BLOCKED_PROVIDER, providerMessageId: null, acceptedAt: new Date() };
        }
        return this.driver.send(mail);
    }

    private allows(email: string): boolean {
        if (this.allowed.includes(EVERYONE)) {
            return true;
        }
        const target: string = email.trim().toLowerCase();
        return this.allowed.some((entry: string) => (entry.startsWith('@') ? target.endsWith(entry) : target === entry));
    }
}
