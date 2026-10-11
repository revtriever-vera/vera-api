import { describe, expect, it, vi } from 'vitest';
import { AuthTokens, SessionIssuerPort } from '../ports/session-issuer.port';
import { SessionApplication } from './session.application';

describe('SessionApplication', () => {
    it('delega refresh e logout à porta de emissão', async () => {
        const tokens: AuthTokens = { accessToken: 'a', refreshToken: 'r', user: {} as AuthTokens['user'] };
        const port: Record<string, ReturnType<typeof vi.fn>> = {
            refresh: vi.fn().mockResolvedValue(tokens),
            logout: vi.fn().mockResolvedValue(undefined)
        };
        const application: SessionApplication = new SessionApplication(port as unknown as SessionIssuerPort);

        await expect(application.refresh('raw', { ip: '1.1.1.1' })).resolves.toBe(tokens);
        await application.logout('raw');

        expect(port['refresh']).toHaveBeenCalledWith('raw', { ip: '1.1.1.1' });
        expect(port['logout']).toHaveBeenCalledWith('raw');
    });
});
