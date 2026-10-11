import { ConfigType } from '@nestjs/config';
import { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { authConfig } from '../config/auth.config';
import { RefreshCookieAdapter } from './refresh-cookie.adapter';

function adapterOf(secure: boolean): RefreshCookieAdapter {
    return new RefreshCookieAdapter({ COOKIE_SECURE: secure, REFRESH_TOKEN_TTL_DAYS: 30 } as ConfigType<typeof authConfig>);
}

function responseOf(): { response: Response; cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> } {
    const cookie: ReturnType<typeof vi.fn> = vi.fn();
    const clearCookie: ReturnType<typeof vi.fn> = vi.fn();
    return { response: { cookie, clearCookie } as unknown as Response, cookie, clearCookie };
}

describe('RefreshCookieAdapter', () => {
    it('lê o cookie rt_refresh e devolve vazio quando ausente', () => {
        const adapter: RefreshCookieAdapter = adapterOf(false);

        expect(adapter.read({ cookies: { rt_refresh: 'abc' } } as unknown as Request)).toBe('abc');
        expect(adapter.read({ cookies: {} } as unknown as Request)).toBe('');
        expect(adapter.read({} as unknown as Request)).toBe('');
    });

    it('grava httpOnly, lax, no path /auth, por 30 dias', () => {
        const { response, cookie } = responseOf();

        adapterOf(false).write(response, 'token');

        expect(cookie).toHaveBeenCalledWith('rt_refresh', 'token', {
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/auth',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
    });

    it('marca secure conforme a configuração', () => {
        const { response, cookie } = responseOf();

        adapterOf(true).write(response, 'token');

        expect(cookie).toHaveBeenCalledWith('rt_refresh', 'token', expect.objectContaining({ secure: true }));
    });

    it('limpa o cookie com os mesmos atributos', () => {
        const { response, clearCookie } = responseOf();

        adapterOf(true).clear(response);

        expect(clearCookie).toHaveBeenCalledWith('rt_refresh', { httpOnly: true, sameSite: 'lax', secure: true, path: '/auth' });
    });
});
