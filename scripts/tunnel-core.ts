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
    readonly force: boolean;
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
    readonly content?: string;
}

interface DnsPlan {
    readonly route: Route;
    readonly record: DnsRecord | undefined;
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
    throw new Error('uso: npx tsx scripts/tunnel.ts <dev|prod> [--routes-only] [--force]');
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
        routesOnly,
        force: args.includes('--force')
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

async function findTunnel(settings: TunnelSettings, name: string): Promise<Tunnel | undefined> {
    const base: string = `/accounts/${settings.accountId}/cfd_tunnel`;
    const tunnels: Tunnel[] = await call<Tunnel[]>(settings, `${base}?name=${name}&is_deleted=false`);
    return tunnels.find((tunnel: Tunnel): boolean => tunnel.name === name && tunnel.deleted_at === null);
}

async function createTunnel(settings: TunnelSettings, name: string, deps: TunnelDependencies): Promise<Tunnel> {
    const created: Tunnel = await call<Tunnel>(settings, `/accounts/${settings.accountId}/cfd_tunnel`, {
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

function targetOf(tunnelId: string): string {
    return `${tunnelId}.cfargotunnel.com`;
}

async function planDns(settings: TunnelSettings, zoneId: string, routes: readonly Route[]): Promise<DnsPlan[]> {
    const plans: DnsPlan[] = [];
    for (const route of routes) {
        const records: DnsRecord[] = await call<DnsRecord[]>(
            settings,
            `/zones/${zoneId}/dns_records?name=${encodeURIComponent(route.hostname)}&type=CNAME`
        );
        plans.push({ route, record: records[0] });
    }
    return plans;
}

function currentTarget(record: DnsRecord | undefined): string {
    if (!record) {
        return '(não existe)';
    }
    return record.content ?? '(sem conteúdo)';
}

function isForeign(record: DnsRecord | undefined, expectedTarget: string | undefined): boolean {
    if (!record) {
        return false;
    }
    return expectedTarget === undefined || record.content !== expectedTarget;
}

function assertNoForeignRecords(
    plans: readonly DnsPlan[],
    expectedTarget: string | undefined,
    settings: TunnelSettings,
    deps: TunnelDependencies
): void {
    for (const { route, record } of plans) {
        deps.log(`dns: ${route.hostname} -> ${currentTarget(record)}`);
    }
    const foreign: string[] = plans
        .filter((plan: DnsPlan): boolean => isForeign(plan.record, expectedTarget))
        .map((plan: DnsPlan): string => `${plan.route.hostname} (aponta para ${currentTarget(plan.record)})`);
    if (foreign.length === 0 || settings.force) {
        return;
    }
    throw new Error(
        `abortado sem alterar nada: CNAME existente aponta para outro alvo que não ${expectedTarget ?? 'o túnel da Vera'}: ${foreign.join(', ')}. ` +
            'Se for mesmo para sobrescrever, rode com --force'
    );
}

async function applyDns(
    settings: TunnelSettings,
    zoneId: string,
    plans: readonly DnsPlan[],
    tunnelId: string,
    deps: TunnelDependencies
): Promise<void> {
    for (const { route, record } of plans) {
        const payload: string = JSON.stringify({ type: 'CNAME', name: route.hostname, content: targetOf(tunnelId), proxied: true });
        if (record) {
            await call(settings, `/zones/${zoneId}/dns_records/${record.id}`, { method: 'PUT', body: payload });
            deps.log(`CNAME atualizado: ${route.hostname}`);
            continue;
        }
        await call(settings, `/zones/${zoneId}/dns_records`, { method: 'POST', body: payload });
        deps.log(`CNAME criado: ${route.hostname}`);
    }
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
    const name: string = `vera-${settings.environment}`;
    const existing: Tunnel | undefined = await findTunnel(settings, name);
    const plans: DnsPlan[] = await planDns(settings, zone.id, routes);
    assertNoForeignRecords(plans, existing ? targetOf(existing.id) : undefined, settings, deps);
    if (existing) {
        deps.log(`tunnel existente: ${existing.name}`);
    }
    const tunnel: Tunnel = existing ?? (await createTunnel(settings, name, deps));
    await putIngress(settings, tunnel.id, routes, deps);
    await applyDns(settings, zone.id, plans, tunnel.id, deps);
    if (!settings.routesOnly) {
        await storeToken(settings, tunnel.id, deps);
    }
    deps.log(`pronto: ${routes.map((route: Route): string => `https://${route.hostname}`).join(' ')}`);
}
