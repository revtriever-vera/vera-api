import { Request } from 'express';

const CLOUDFLARE_CLIENT_IP: string = 'cf-connecting-ip';

export function clientIp(req: Request): string | undefined {
    const header: string | string[] | undefined = req.headers[CLOUDFLARE_CLIENT_IP];
    const forwarded: string | undefined = Array.isArray(header) ? header[0] : header;
    return forwarded?.trim() || req.ip;
}
