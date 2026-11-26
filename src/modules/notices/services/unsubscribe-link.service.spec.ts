import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { InvalidUnsubscribeTokenError } from '../domain/notices.errors';
import { UnsubscribeLinkService, UnsubscribeSubject } from './unsubscribe-link.service';

class FakeHmac extends HmacPort {
    public constructor(private readonly salt: string) {
        super();
    }

    public sha256Hex(value: string): string {
        return createHmac('sha256', this.salt).update(value).digest('hex');
    }
}

const SUBJECT: UnsubscribeSubject = {
    companyId: '0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e90',
    userId: '0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e91',
    type: 'goal_behind'
};

function service(salt: string = 'a'): UnsubscribeLinkService {
    return new UnsubscribeLinkService(new FakeHmac(salt), {
        PUBLIC_API_URL: 'https://api.vera.example',
        APP_URL: 'https://app.vera.example'
    });
}

describe('UnsubscribeLinkService', () => {
    it('signs a token that verifies back to the same company, person and type', () => {
        expect(service().verify(service().tokenFor(SUBJECT))).toEqual(SUBJECT);
    });

    it('signs a token that carries several types for a grouped e-mail', () => {
        const grouped: UnsubscribeSubject = { ...SUBJECT, type: 'goal_behind,goal_late' };

        expect(service().verify(service().tokenFor(grouped))).toEqual(grouped);
    });

    it('builds the one-click URL on the public API and the confirmation page URL on the app', () => {
        const token: string = service().tokenFor(SUBJECT);

        expect(service().urlFor(SUBJECT)).toBe(`https://api.vera.example/notifications/unsubscribe/${token}`);
        expect(service().pageUrlOf(token)).toBe(`https://app.vera.example/avisos/sair/${encodeURIComponent(token)}`);
        expect(service().appUrl()).toBe('https://app.vera.example');
    });

    it('rejects a token signed with another key, a changed body, extra parts and garbage', () => {
        const token: string = service('a').tokenFor(SUBJECT);
        const [body, signature]: string[] = token.split('.');
        const otherBody: string = Buffer.from(`${SUBJECT.companyId}.${SUBJECT.userId}.other_type`).toString('base64url');
        const attempts: string[] = [
            service('b').tokenFor(SUBJECT),
            `${otherBody}.${signature ?? ''}`,
            `${token}.extra`,
            body ?? '',
            '',
            'a.b'
        ];

        for (const attempt of attempts) {
            expect(() => service('a').verify(attempt)).toThrow(InvalidUnsubscribeTokenError);
        }
    });

    it('rejects a correctly signed body that is not company, person and type', () => {
        const body: string = Buffer.from('not-an-id.not-an-id.Bad Type').toString('base64url');
        const token: string = `${body}.${new FakeHmac('a').sha256Hex(body)}`;

        expect(() => service('a').verify(token)).toThrow(InvalidUnsubscribeTokenError);
    });
});
