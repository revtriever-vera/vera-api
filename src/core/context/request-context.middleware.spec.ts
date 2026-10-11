import { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { AlsAppContext } from './als-app-context';
import { AppContextData } from './app-context.port';
import { RequestContextMiddleware } from './request-context.middleware';

function requestWith(headers: Record<string, string | undefined>): Request {
    return { headers } as unknown as Request;
}

function fakeResponse(): { response: Response; header: Record<string, string> } {
    const header: Record<string, string> = {};
    const response: Response = {
        setHeader: (name: string, value: string): void => {
            header[name] = value;
        }
    } as unknown as Response;
    return { response, header };
}

function capture(context: AlsAppContext): { next: NextFunction; result: () => AppContextData } {
    let seen: AppContextData | undefined;
    const next: NextFunction = (): void => {
        seen = context.get();
    };
    const result = (): AppContextData => {
        if (seen === undefined) {
            throw new Error('next() was never called');
        }
        return seen;
    };
    return { next, result };
}

describe('RequestContextMiddleware', () => {
    it('runs next() inside an AppContext carrying a fresh requestId and the pt-BR fallback locale', () => {
        const context: AlsAppContext = new AlsAppContext();
        const middleware: RequestContextMiddleware = new RequestContextMiddleware(context);
        const { response, header } = fakeResponse();
        const { next, result } = capture(context);

        middleware.use(requestWith({}), response, next);

        expect(result().locale).toBe('pt-BR');
        expect(result().requestId).toBe(header['x-request-id']);
    });

    it('reuses an incoming x-request-id instead of minting a new one', () => {
        const context: AlsAppContext = new AlsAppContext();
        const middleware: RequestContextMiddleware = new RequestContextMiddleware(context);
        const { response } = fakeResponse();
        const { next, result } = capture(context);

        middleware.use(requestWith({ 'x-request-id': 'req-fixed' }), response, next);

        expect(result().requestId).toBe('req-fixed');
    });

    it('resolves locale from Accept-Language when there is no user/company yet', () => {
        const context: AlsAppContext = new AlsAppContext();
        const middleware: RequestContextMiddleware = new RequestContextMiddleware(context);
        const { response } = fakeResponse();
        const { next, result } = capture(context);

        middleware.use(requestWith({ 'accept-language': 'en-US,en;q=0.9,pt-BR;q=0.8' }), response, next);

        expect(result().locale).toBe('en');
    });

    it('falls back to pt-BR when Accept-Language is absent or unrecognised', () => {
        const context: AlsAppContext = new AlsAppContext();
        const middleware: RequestContextMiddleware = new RequestContextMiddleware(context);
        const { response } = fakeResponse();
        const { next, result } = capture(context);

        middleware.use(requestWith({ 'accept-language': 'de-DE' }), response, next);

        expect(result().locale).toBe('pt-BR');
    });
});
