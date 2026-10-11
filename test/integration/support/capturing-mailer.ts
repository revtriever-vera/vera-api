import { EnqueueMailRequest, MailerPort } from '../../../src/core/mail/mailer.port';

export class CapturingMailer extends MailerPort {
    public readonly sent: EnqueueMailRequest[] = [];

    public async enqueue(request: EnqueueMailRequest): Promise<void> {
        this.sent.push(request);
        return Promise.resolve();
    }

    public latestFor(email: string): EnqueueMailRequest {
        const match: EnqueueMailRequest | undefined = [...this.sent]
            .reverse()
            .find((request: EnqueueMailRequest) => request.to.email === email);
        if (!match) {
            throw new Error(`no e-mail captured for ${email}`);
        }
        return match;
    }

    public latestCodeFor(email: string): string {
        const code: string | undefined = this.latestFor(email).props['code'];
        if (code === undefined) {
            throw new Error(`captured e-mail for ${email} has no code prop`);
        }
        return code;
    }
}
