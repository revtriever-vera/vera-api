import { describe, expect, it } from 'vitest';
import { Request } from 'express';
import { clientIp } from './client-ip';

function req(headers: Record<string, string | string[]>, ip?: string): Request {
    return { headers, ip } as unknown as Request;
}

describe('clientIp', () => {
    it('prefere o cf-connecting-ip, que o Cloudflare põe com o IP real', () => {
        expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.7' }, '127.0.0.1'))).toBe('203.0.113.7');
    });

    it('cai no req.ip quando não há Cloudflare na frente (local)', () => {
        expect(clientIp(req({}, '10.0.0.5'))).toBe('10.0.0.5');
    });

    it('não confunde o par imediato com o cliente: sem o header, seria 127.0.0.1', () => {
        expect(clientIp(req({}, '127.0.0.1'))).toBe('127.0.0.1');
        expect(clientIp(req({ 'cf-connecting-ip': '198.51.100.9' }, '127.0.0.1'))).toBe('198.51.100.9');
    });

    it('ignora um header vazio e volta ao req.ip', () => {
        expect(clientIp(req({ 'cf-connecting-ip': '   ' }, '10.0.0.5'))).toBe('10.0.0.5');
    });

    it('usa a primeira entrada quando o header vem duplicado', () => {
        expect(clientIp(req({ 'cf-connecting-ip': ['203.0.113.7', '203.0.113.8'] }, '127.0.0.1'))).toBe('203.0.113.7');
    });
});
