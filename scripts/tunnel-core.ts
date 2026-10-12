import { execFileSync } from 'node:child_process';

const API: string = 'https://api.cloudflare.com/client/v4';
const TOKEN_PARAMETER: string = '/vera/tunnel-token';
const DEFAULT_REGION: string = 'us-east-1';
const DEFAULT_APP_PORT: string = '3333';
const DEFAULT_MAILPIT_PORT: string = '8027';

export type TunnelEnvironment = 'dev' | 'prod';

export interface Route {
    readonly hostname: string;
    readonly service: string;
}

export interface TunnelSettings {
    readonly environment: TunnelEnvironment;
    readonly domain: string;
    readonly hostPrefix: string;
    readonly accountId: string;
    readonly apiToken: string;
    readonly awsProfile: string | null;
    readonly awsRegion: string;
    readonly appPort: string;
    readonly mailpitPort: string;
    readonly routesOnly: boolean;
}

export interface TunnelDependencies {
    readonly putParameter: (name: string, value: string, settings: TunnelSettings) => void;
    readonly log: (message: string) => void;
}

interface CloudflareResponse<T> {
    readonly success: boolean;
    readonly errors: readonly { readonly code: number; readonly message: string }[];
    readonly result: T;
}

interface Tunnel {
    readonly id: string;
    readonly name: string;
    readonly deleted_at: string | null;
}

interface Zone {
    readonly id: string;
}

interface DnsRecord {
    readonly id: string;
    readonly name: string;
}

interface CallOptions {
    readonly method?: string;
    readonly body?: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
    const value: string | undefined = env[name];
    if (value === undefined || value.length === 0) {
        throw new Error(`variável de ambiente obrigatória ausente: ${name}`);
    }
    return value;
}

function environmentOf(argument: string | undefined): TunnelEnvironment {
    if (argument === 'dev' || argument === 'prod') {
        return argument;
    }
    throw new Error('uso: npx tsx scripts/tunnel.ts <dev|prod> [--routes-only]');
}

function hostPrefixOf(env: NodeJS.ProcessEnv): string {
    const value: string = (env['VERA_HOST_PREFIX'] ?? '').trim().toLowerCase();
    if (value.length > 0 && !/^[a-z0-9-]{0,19}-$/.test(value)) {
        throw new Error('VERA_HOST_PREFIX inválida: use até 20 caracteres de a-z, 0-9 e hífen, terminando em hífen');
    }
    return value;
}

export function settingsFrom(args: readonly string[], env: NodeJS.ProcessEnv): TunnelSettings {
    const environment: TunnelEnvironment = environmentOf(args.find((argument: string): boolean => !argument.startsWith('--')));
    const routesOnly: boolean = args.includes('--routes-only');
    return {
        environment,
        domain: required(env, 'VERA_DOMAIN'),
        hostPrefix: hostPrefixOf(env),
        accountId: required(env, 'CLOUDFLARE_ACCOUNT_ID'),
        apiToken: required(env, 'CLOUDFLARE_API_TOKEN'),
        awsProfile: routesOnly ? null : required(env, 'AWS_PROFILE'),
        awsRegion: env['AWS_REGION'] ?? DEFAULT_REGION,
        appPort: env['PORT'] ?? DEFAULT_APP_PORT,
        mailpitPort: env['MAILPIT_UI_PORT'] ?? DEFAULT_MAILPIT_PORT,
        routesOnly
    };
}

export function routesOf(settings: TunnelSettings): Route[] {
    const api: Route = {
        hostname: `${settings.hostPrefix}${settings.environment === 'prod' ? 'api' : 'api-dev'}.${settings.domain}`,
        service: `http://localhost:${settings.appPort}`
    };
    if (settings.environment === 'prod') {
        return [api];
    }
    return [api, { hostname: `${settings.hostPrefix}mail-dev.${settings.domain}`, service: `http://localhost:${settings.mailpitPort}` }];
}

async function call<T>(settings: TunnelSettings, path: string, options: CallOptions = {}): Promise<T> {
    const response: Response = await fetch(`${API}${path}`, {
        method: options.method,
        body: options.body,
        headers: { Authorization: `Bearer ${settings.apiToken}`, 'Content-Type': 'application/json' }
    });
    const body: CloudflareResponse<T> = (await response.json()) as CloudflareResponse<T>;
    if (!body.success) {
        throw new Error(`${path}: ${body.errors.map((error): string => `${String(error.code)} ${error.message}`).join('; ')}`);
    }
    return body.result;
}

async function findZone(settings: TunnelSettings): Promise<Zone> {
    const zones: Zone[] = await call<Zone[]>(settings, `/zones?name=${encodeURIComponent(settings.domain)}`);
    const found: Zone | undefined = zones[0];
    if (!found) {
        throw new Error('zona não encontrada com este token para o domínio informado');
    }
    return found;
}

async function findOrCreateTunnel(settings: TunnelSettings, name: string, deps: TunnelDependencies): Promise<Tunnel> {
    const base: string = `/accounts/${settings.accountId}/cfd_tunnel`;
    const tunnels: Tunnel[] = await call<Tunnel[]>(settings, `${base}?name=${name}&is_deleted=false`);
    const existing: Tunnel | undefined = tunnels.find((tunnel: Tunnel): boolean => tunnel.name === name && tunnel.deleted_at === null);
    if (existing) {
        deps.log(`tunnel existente: ${existing.name}`);
        return existing;
    }
    const created: Tunnel = await call<Tunnel>(settings, base, {
        method: 'POST',
        body: JSON.stringify({ name, config_src: 'cloudflare' })
    });
    deps.log(`tunnel criado: ${created.name}`);
    return created;
}

async function putIngress(settings: TunnelSettings, tunnelId: string, routes: readonly Route[], deps: TunnelDependencies): Promise<void> {
    await call(settings, `/accounts/${settings.accountId}/cfd_tunnel/${tunnelId}/configurations`, {
        method: 'PUT',
        body: JSON.stringify({ config: { ingress: [...routes, { service: 'http_status:404' }] } })
    });
    for (const route of routes) {
        deps.log(`ingress: ${route.hostname} -> ${route.service}`);
    }
}

async function upsertDns(
    settings: TunnelSettings,
    zoneId: string,
    hostname: string,
    tunnelId: string,
    deps: TunnelDependencies
): Promise<void> {
    const records: DnsRecord[] = await call<DnsRecord[]>(
        settings,
        `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}&type=CNAME`
    );
    const existing: DnsRecord | undefined = records[0];
    const payload: string = JSON.stringify({ type: 'CNAME', name: hostname, content: `${tunnelId}.cfargotunnel.com`, proxied: true });
    if (existing) {
        await call(settings, `/zones/${zoneId}/dns_records/${existing.id}`, { method: 'PUT', body: payload });
        deps.log(`CNAME atualizado: ${hostname}`);
        return;
    }
    await call(settings, `/zones/${zoneId}/dns_records`, { method: 'POST', body: payload });
    deps.log(`CNAME criado: ${hostname}`);
}

async function storeToken(settings: TunnelSettings, tunnelId: string, deps: TunnelDependencies): Promise<void> {
    const token: string = await call<string>(settings, `/accounts/${settings.accountId}/cfd_tunnel/${tunnelId}/token`);
    deps.putParameter(TOKEN_PARAMETER, token, settings);
    deps.log(`token guardado em ${TOKEN_PARAMETER}`);
}

export function putParameterWithAwsCli(name: string, value: string, settings: TunnelSettings): void {
    try {
        execFileSync(
            'aws',
            [
                'ssm',
                'put-parameter',
                '--cli-input-json',
                'file:///dev/stdin',
                '--region',
                settings.awsRegion,
                '--profile',
                settings.awsProfile ?? ''
            ],
            { input: JSON.stringify({ Name: name, Value: value, Type: 'SecureString', Overwrite: true }), stdio: ['pipe', 'pipe', 'pipe'] }
        );
    } catch {
        throw new Error(`falha ao gravar ${name} no SSM; confira o perfil AWS e a sessão`);
    }
}

export async function runTunnel(settings: TunnelSettings, deps: TunnelDependencies): Promise<void> {
    const routes: Route[] = routesOf(settings);
    const zone: Zone = await findZone(settings);
    const tunnel: Tunnel = await findOrCreateTunnel(settings, `vera-${settings.environment}`, deps);
    await putIngress(settings, tunnel.id, routes, deps);
    for (const route of routes) {
        await upsertDns(settings, zone.id, route.hostname, tunnel.id, deps);
    }
    if (!settings.routesOnly) {
        await storeToken(settings, tunnel.id, deps);
    }
    deps.log(`pronto: ${routes.map((route: Route): string => `https://${route.hostname}`).join(' ')}`);
}
