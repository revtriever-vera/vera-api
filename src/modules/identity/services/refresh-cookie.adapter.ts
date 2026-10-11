import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Request, Response } from 'express';
import { authConfig } from '../config/auth.config';

const COOKIE_NAME: string = 'rt_refresh';
const PATH: string = '/auth';
const DAY_MS: number = 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshCookieAdapter {
    public constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

    public read(request: Request): string {
        const cookies: Record<string, string | undefined> | undefined = request.cookies as Record<string, string | undefined> | undefined;
        return cookies?.[COOKIE_NAME] ?? '';
    }

    public write(response: Response, token: string): void {
        response.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: this.config.COOKIE_SECURE,
            path: PATH,
            maxAge: this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS
        });
    }

    public clear(response: Response): void {
        response.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: this.config.COOKIE_SECURE, path: PATH });
    }
}
