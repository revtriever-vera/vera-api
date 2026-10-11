import { describe, expect, it } from 'vitest';
import { headersFor } from './mail-headers';
import { Mail } from './mail.types';

function mail(unsubscribeUrl?: string): Mail {
    return { to: { email: 'contato@example.test' }, subject: 'Aviso', html: '<p>oi</p>', text: 'oi', unsubscribeUrl };
}

describe('mail headers', () => {
    it('marks the message as automated, so an out-of-office does not answer it', () => {
        expect(headersFor(mail())['Auto-Submitted']).toBe('auto-generated');
    });

    it('advertises one-click unsubscribe, which Gmail and Yahoo require from bulk senders', () => {
        const headers: Readonly<Record<string, string>> = headersFor(mail('https://api.vera.example/notifications/unsubscribe/abc'));

        expect(headers['List-Unsubscribe']).toBe('<https://api.vera.example/notifications/unsubscribe/abc>');
        expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    });

    it('omits the header when there is no url, instead of shipping a broken one', () => {
        expect(headersFor(mail())['List-Unsubscribe']).toBeUndefined();
        expect(headersFor(mail(''))['List-Unsubscribe']).toBeUndefined();
    });

    it('refuses a url that is not https, because the header is followed unattended by the mail client', () => {
        expect(headersFor(mail('http://api.vera.example/u/abc'))['List-Unsubscribe']).toBeUndefined();
        expect(headersFor(mail('javascript:alert(1)'))['List-Unsubscribe']).toBeUndefined();
    });

    it('refuses a url with a bracket or space that would break the header', () => {
        expect(headersFor(mail('https://api.test/u/a b'))['List-Unsubscribe']).toBeUndefined();
        expect(headersFor(mail('https://api.test/u/a>x'))['List-Unsubscribe']).toBeUndefined();
    });
});
