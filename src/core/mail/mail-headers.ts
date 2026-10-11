import { Mail } from './mail.types';

const ONE_CLICK: string = 'List-Unsubscribe=One-Click';
const SAFE_URL: RegExp = /^https:\/\/[^\s"'<>]+$/;

export function headersFor(mail: Mail): Readonly<Record<string, string>> {
    const base: Record<string, string> = { 'Auto-Submitted': 'auto-generated' };
    const url: string = mail.unsubscribeUrl ?? '';
    if (!SAFE_URL.test(url)) {
        return base;
    }
    return { ...base, 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': ONE_CLICK };
}
