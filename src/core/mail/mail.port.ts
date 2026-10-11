import { Mail, MailReceipt } from './mail.types';

export abstract class MailPort {
    public abstract send(mail: Mail): Promise<MailReceipt>;
}
