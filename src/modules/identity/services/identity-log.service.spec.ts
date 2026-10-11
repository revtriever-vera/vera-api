import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { IdentityLogService } from './identity-log.service';

function build(): { logs: IdentityLogService; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } {
    const info: ReturnType<typeof vi.fn> = vi.fn();
    const warn: ReturnType<typeof vi.fn> = vi.fn();
    return { logs: new IdentityLogService({ info, warn } as unknown as LogService), info, warn };
}

describe('IdentityLogService', () => {
    it('registra login, refresh e logout em identity-auth sem dados pessoais', () => {
        const { logs, info } = build();

        logs.loginSucceeded('user-1', 'google');
        logs.refreshed('user-1');
        logs.loggedOut('user-1');

        expect(info.mock.calls.map((call: unknown[]) => call[0])).toEqual([
            { message: 'login succeeded', identifier: 'identity-auth', meta: { userId: 'user-1', provider: 'google' } },
            { message: 'refreshed', identifier: 'identity-auth', meta: { userId: 'user-1' } },
            { message: 'logged out', identifier: 'identity-auth', meta: { userId: 'user-1' } }
        ]);
    });

    it('registra o reuso em warn com a família e quantas sessões foram revogadas', () => {
        const { logs, warn } = build();

        logs.refreshReuseDetected('family-1', 3, 'user-1');

        expect(warn).toHaveBeenCalledWith({
            message: 'refresh token reused — session family revoked',
            identifier: 'auth-refresh-reuse',
            meta: { familyId: 'family-1', revoked: 3, userId: 'user-1' }
        });
    });
});
