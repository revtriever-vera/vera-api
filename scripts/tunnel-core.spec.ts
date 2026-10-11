import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTunnel, routesOf, settingsFrom, TunnelSettings } from './tunnel-core';

const ENV: NodeJS.ProcessEnv = {
    VERA_DOMAIN: 'example.test',
    CLOUDFLARE_ACCOUNT_ID: 'account-1',
    CLOUDFLARE_API_TOKEN: 'cf-token',
    AWS_PROFILE: 'profile-1'
};

function ok(result: unknown): Response {
    return { json: () => Promise.resolve({ success: true, errors: [], result }) } as Response;
}

function settings(environment: 'dev' | 'prod', extra: readonly string[] = []): TunnelSettings {
    return settingsFrom([environment, ...extra], ENV);
}

function describeCalls(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls.map((call: unknown[]): string => {
        const init: RequestInit = call[1] as RequestInit;
        return `${init.method ?? 'GET'} ${String(call[0])}`;
    });
}

describe('settingsFrom', () => {
    it('requires an explicit environment', () => {
        expect(() => settingsFrom([], ENV)).toThrow('uso:');
        expect(() => settingsFrom(['staging'], ENV)).toThrow('uso:');
    });

    it('fails with the missing variable name', () => {
        expect(() => settingsFrom(['dev'], { ...ENV, VERA_DOMAIN: '' })).toThrow('VERA_DOMAIN');
        expect(() => settingsFrom(['dev'], { ...ENV, CLOUDFLARE_ACCOUNT_ID: undefined })).toThrow('CLOUDFLARE_ACCOUNT_ID');
        expect(() => settingsFrom(['dev'], { ...ENV, AWS_PROFILE: undefined })).toThrow('AWS_PROFILE');
    });

    it('does not require the AWS profile with --routes-only', () => {
        const result: TunnelSettings = settingsFrom(['dev', '--routes-only'], { ...ENV, AWS_PROFILE: undefined });
        expect(result.awsProfile).toBeNull();
        expect(result.routesOnly).toBe(true);
    });

    it('applies defaults and overrides for ports and region', () => {
        expect(settings('dev')).toMatchObject({ appPort: '3333', mailpitPort: '8027', awsRegion: 'us-east-1' });
        const custom: TunnelSettings = settingsFrom(['dev'], { ...ENV, PORT: '4000', MAILPIT_UI_PORT: '9000', AWS_REGION: 'sa-east-1' });
        expect(custom).toMatchObject({ appPort: '4000', mailpitPort: '9000', awsRegion: 'sa-east-1' });
    });
});

describe('routesOf', () => {
    it('routes api-dev and the mailpit webmail in dev', () => {
        expect(routesOf(settings('dev'))).toEqual([
            { hostname: 'api-dev.example.test', service: 'http://localhost:3333' },
            { hostname: 'mail-dev.example.test', service: 'http://localhost:8027' }
        ]);
    });

    it('routes only api in prod', () => {
        expect(routesOf(settings('prod'))).toEqual([{ hostname: 'api.example.test', service: 'http://localhost:3333' }]);
    });
});

describe('runTunnel', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubFetch(handler: (url: string, method: string) => Response): ReturnType<typeof vi.fn> {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn((url: string, init: RequestInit) =>
            Promise.resolve(handler(url, init.method ?? 'GET'))
        );
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    it('creates tunnel, ingress, dns and stores the token', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = stubFetch((url: string, method: string): Response => {
            if (url.includes('/zones?name=')) {
                return ok([{ id: 'zone-1' }]);
            }
            if (url.includes('cfd_tunnel?name=')) {
                return ok([]);
            }
            if (url.endsWith('/cfd_tunnel') && method === 'POST') {
                return ok({ id: 'tunnel-1', name: 'vera-dev', deleted_at: null });
            }
            if (url.endsWith('/token')) {
                return ok('tunnel-token');
            }
            if (url.includes('dns_records?')) {
                return ok([]);
            }
            return ok({});
        });
        const putParameter = vi.fn();
        const log = vi.fn();

        await runTunnel(settings('dev'), { putParameter, log });

        const calls: string[] = describeCalls(fetchMock);
        expect(calls).toContain('POST https://api.cloudflare.com/client/v4/accounts/account-1/cfd_tunnel');
        expect(calls).toContain('PUT https://api.cloudflare.com/client/v4/accounts/account-1/cfd_tunnel/tunnel-1/configurations');
        expect(calls).toContain('POST https://api.cloudflare.com/client/v4/zones/zone-1/dns_records');
        expect(putParameter).toHaveBeenCalledWith(
            '/vera/tunnel-token',
            'tunnel-token',
            expect.objectContaining({ awsProfile: 'profile-1' })
        );
        expect(log).toHaveBeenCalledWith('pronto: https://api-dev.example.test https://mail-dev.example.test');
    });

    it('reuses the tunnel, updates existing cnames and skips the token with --routes-only', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = stubFetch((url: string): Response => {
            if (url.includes('/zones?name=')) {
                return ok([{ id: 'zone-1' }]);
            }
            if (url.includes('cfd_tunnel?name=')) {
                return ok([{ id: 'tunnel-9', name: 'vera-prod', deleted_at: null }]);
            }
            if (url.includes('dns_records?')) {
                return ok([{ id: 'record-1', name: 'api.example.test' }]);
            }
            return ok({});
        });
        const putParameter = vi.fn();
        const log = vi.fn();

        await runTunnel(settings('prod', ['--routes-only']), { putParameter, log });

        const calls: string[] = describeCalls(fetchMock);
        expect(calls).toContain('PUT https://api.cloudflare.com/client/v4/zones/zone-1/dns_records/record-1');
        expect(calls.some((call: string): boolean => call.endsWith('/token'))).toBe(false);
        expect(putParameter).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith('tunnel existente: vera-prod');
    });

    it('fails when the zone is not found', async () => {
        stubFetch((): Response => ok([]));
        await expect(runTunnel(settings('dev'), { putParameter: vi.fn(), log: vi.fn() })).rejects.toThrow('zona não encontrada');
    });

    it('surfaces Cloudflare errors', async () => {
        stubFetch(
            (): Response =>
                ({
                    json: () => Promise.resolve({ success: false, errors: [{ code: 10000, message: 'denied' }], result: null })
                }) as Response
        );
        await expect(runTunnel(settings('dev'), { putParameter: vi.fn(), log: vi.fn() })).rejects.toThrow('10000 denied');
    });
});
