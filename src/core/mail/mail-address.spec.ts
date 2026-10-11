import { describe, expect, it } from 'vitest';
import { formatAddress } from './mail-address';

const EMAIL: string = 'no-reply@vera.example';

describe('mail address', () => {
    it('puts the company name in front of our address, which is what the inbox shows', () => {
        expect(formatAddress('Batata', EMAIL)).toBe(`Batata <${EMAIL}>`);
    });

    it('falls back to the bare address when there is no name', () => {
        expect(formatAddress('', EMAIL)).toBe(EMAIL);
        expect(formatAddress('   ', EMAIL)).toBe(EMAIL);
    });

    it('strips CRLF, because a display name is tenant input landing in a header', () => {
        const forged: string = formatAddress('Batata\r\nBcc: vitima@alvo.test', EMAIL);

        expect(forged).not.toContain('\r');
        expect(forged).not.toContain('\n');
        expect(forged).toBe(`"Batata Bcc: vitima@alvo.test" <${EMAIL}>`);
    });

    it('quotes and escapes a name that carries address punctuation', () => {
        expect(formatAddress('Batata, Ltda', EMAIL)).toBe(`"Batata, Ltda" <${EMAIL}>`);
        expect(formatAddress('Bata"ta', EMAIL)).toBe(`"Bata\\"ta" <${EMAIL}>`);
        expect(formatAddress('fake <chefe@alvo.test>', EMAIL)).toBe(`"fake <chefe@alvo.test>" <${EMAIL}>`);
    });
});
