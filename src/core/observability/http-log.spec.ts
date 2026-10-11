import { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { requestLogLevel, requestLogProps } from './http-log';

function request(url: string, originalUrl?: string): IncomingMessage {
    return { url, originalUrl } as unknown as IncomingMessage;
}

function response(statusCode: number, headers: Record<string, string> = {}, headersSent: boolean = true): ServerResponse {
    return {
        statusCode,
        headersSent,
        getHeader: (name: string): string | undefined => headers[name]
    } as unknown as ServerResponse;
}

describe('linha de request do pino-http', () => {
    it('cala a sonda de saúde do ECS, que bate a cada 30s e enchia o log', () => {
        expect(requestLogLevel(request('/health'), response(200))).toBe('silent');
    });

    it('cala a sonda mesmo quando o express já reescreveu req.url', () => {
        expect(requestLogLevel(request('/', '/health?probe=1'), response(200))).toBe('silent');
    });

    it('continua logando a sonda que falhou, que é justamente quando ela importa', () => {
        expect(requestLogLevel(request('/health'), response(503))).toBe('info');
        expect(requestLogLevel(request('/health'), response(200), new Error('socket hang up'))).toBe('info');
    });

    it('não confunde o readiness nem outras rotas com a sonda', () => {
        expect(requestLogLevel(request('/health/ready'), response(200))).toBe('info');
        expect(requestLogLevel(request('/stores'), response(200))).toBe('info');
    });

    it('carrega o requestId da resposta, para juntar a linha de request com os logs da aplicação', () => {
        expect(requestLogProps(request('/stores'), response(200, { 'x-request-id': 'req-123' }))).toEqual({ requestId: 'req-123' });
    });

    it('não amarra nada na chegada do request, antes de a resposta sair', () => {
        expect(requestLogProps(request('/stores'), response(200, { 'x-request-id': 'req-123' }, false))).toEqual({});
    });

    it('não inventa requestId quando a resposta saiu sem ele', () => {
        expect(requestLogProps(request('/stores'), response(200))).toEqual({});
    });
});
