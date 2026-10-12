import { z } from 'zod';
import { dev } from './dev';
import { prod } from './prod';

export type EnvironmentName = 'dev' | 'prod';

export interface MailpitEnvironmentConfig {
    readonly host: string;
    readonly uiAuthParameter: string;
}

export interface SharedInfrastructureConfig {
    readonly vpcId: string;
    readonly availabilityZones: readonly string[];
    readonly publicSubnetIds: readonly string[];
    readonly databaseInstanceId: string;
    readonly databaseEndpoint: string;
    readonly databaseSecurityGroupId: string;
    readonly redisEndpoint: string;
    readonly redisSecurityGroupId: string;
    readonly openIdConnectProviderArn: string;
}

export interface EnvironmentConfig {
    readonly name: EnvironmentName;
    readonly account: string;
    readonly region: string;
    readonly domain: string;
    readonly apiHost: string;
    readonly appHost: string;
    readonly shared: SharedInfrastructureConfig;
    readonly githubRepository: string;
    readonly githubSubjects: readonly string[];
    readonly imageRetentionCount: number;
    readonly imagePullAccounts: readonly string[];
    readonly architecture: 'x86_64' | 'arm64';
    readonly spotCompute: boolean;
    readonly offHoursShutdown: boolean;
    readonly mailpit: MailpitEnvironmentConfig | null;
    readonly otlpEndpointParameter: string;
    readonly otlpHeadersParameter: string | null;
}

export interface MailpitSettings {
    readonly hostPrefix: string;
    readonly uiAuthParameter: string;
}

export interface EnvironmentSettings {
    readonly name: EnvironmentName;
    readonly region: string;
    readonly hostSuffix: string;
    readonly githubRepository: string;
    readonly githubSubjects: readonly string[];
    readonly imageRetentionCount: number;
    readonly architecture: 'x86_64' | 'arm64';
    readonly spotCompute: boolean;
    readonly offHoursShutdown: boolean;
    readonly mailpit: MailpitSettings | null;
    readonly otlpEndpointParameter: string;
    readonly otlpHeadersParameter: string | null;
}

interface HostNaming {
    readonly prefix: string;
    readonly domain: string;
}

const SETTINGS: Readonly<Record<EnvironmentName, EnvironmentSettings>> = { dev, prod };
const ACCOUNT_PATTERN: RegExp = /^\d{12}$/;
const HOST_PREFIX_PATTERN: RegExp = /^[a-z0-9-]*$/;
const HOST_PREFIX_MAX_LENGTH: number = 20;
const DOMAIN_PATTERN: RegExp = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const nonEmpty: z.ZodString = z.string().min(1);

const SharedInfrastructureSchema: z.ZodType<SharedInfrastructureConfig> = z.object({
    vpcId: z.string().regex(/^vpc-[0-9a-z]+$/, 'deve ter o formato vpc-...'),
    availabilityZones: z.array(nonEmpty).min(1),
    publicSubnetIds: z.array(z.string().regex(/^subnet-[0-9a-z]+$/, 'deve ter o formato subnet-...')).min(1),
    databaseInstanceId: nonEmpty,
    databaseEndpoint: nonEmpty,
    databaseSecurityGroupId: z.string().regex(/^sg-[0-9a-z]+$/, 'deve ter o formato sg-...'),
    redisEndpoint: nonEmpty,
    redisSecurityGroupId: z.string().regex(/^sg-[0-9a-z]+$/, 'deve ter o formato sg-...'),
    openIdConnectProviderArn: z.string().regex(/^arn:aws[a-z-]*:iam::\d{12}:oidc-provider\/.+$/, 'deve ser o ARN de um provedor OIDC')
});

function suffixOf(name: EnvironmentName): string {
    return name.toUpperCase();
}

function requiredVariable(env: NodeJS.ProcessEnv, variable: string): string {
    const value: string | undefined = env[variable];
    if (value === undefined || value.trim().length === 0) {
        throw new Error(
            `${variable} não definida: configure a variável do repositório no GitHub ou exporte no ambiente local antes do cdk`
        );
    }
    return value.trim();
}

function account(env: NodeJS.ProcessEnv, variable: string): string {
    const value: string = requiredVariable(env, variable);
    if (!ACCOUNT_PATTERN.test(value)) {
        throw new Error(`${variable} inválida: o ID de conta AWS tem 12 dígitos`);
    }
    return value;
}

function domain(env: NodeJS.ProcessEnv): string {
    const value: string = requiredVariable(env, 'VERA_DOMAIN').toLowerCase();
    if (!DOMAIN_PATTERN.test(value)) {
        throw new Error('VERA_DOMAIN inválida: informe o domínio sem protocolo nem barra, por exemplo exemplo.com');
    }
    return value;
}

function hostPrefix(env: NodeJS.ProcessEnv): string {
    const value: string = (env['VERA_HOST_PREFIX'] ?? '').trim().toLowerCase();
    if (value.length === 0) {
        return value;
    }
    if (!HOST_PREFIX_PATTERN.test(value) || !value.endsWith('-') || value.length > HOST_PREFIX_MAX_LENGTH) {
        throw new Error(
            `VERA_HOST_PREFIX inválida: use até ${String(HOST_PREFIX_MAX_LENGTH)} caracteres de a-z, 0-9 e hífen, terminando em hífen, por exemplo vera-`
        );
    }
    return value;
}

function parseJson(variable: string, raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(`${variable} inválida: não é um JSON`);
    }
}

function shared(env: NodeJS.ProcessEnv, variable: string): SharedInfrastructureConfig {
    const result: z.SafeParseReturnType<unknown, SharedInfrastructureConfig> = SharedInfrastructureSchema.safeParse(
        parseJson(variable, requiredVariable(env, variable))
    );
    if (!result.success) {
        const problems: string = result.error.issues
            .map((issue: z.ZodIssue): string => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
            .join('; ');
        throw new Error(`${variable} inválida: ${problems}`);
    }
    return result.data;
}

function imagePullAccounts(env: NodeJS.ProcessEnv): readonly string[] {
    const accounts: string[] = (env['IMAGE_PULL_ACCOUNTS'] ?? '')
        .split(',')
        .map((value: string): string => value.trim())
        .filter((value: string): boolean => value.length > 0);
    for (const value of accounts) {
        if (!ACCOUNT_PATTERN.test(value)) {
            throw new Error('IMAGE_PULL_ACCOUNTS inválida: lista de IDs de conta de 12 dígitos separados por vírgula');
        }
    }
    return accounts;
}

function hostOf(prefix: string, settings: EnvironmentSettings, hosts: HostNaming): string {
    const label: string = `${hosts.prefix}${prefix}${settings.hostSuffix}`;
    if (label.includes('.')) {
        throw new Error(`host inválido ${label}: use um único nível de subdomínio antes de ${hosts.domain}`);
    }
    return `${label}.${hosts.domain}`;
}

function mailpit(settings: EnvironmentSettings, hosts: HostNaming): MailpitEnvironmentConfig | null {
    if (settings.mailpit === null) {
        return null;
    }
    return {
        host: hostOf(settings.mailpit.hostPrefix, settings, hosts),
        uiAuthParameter: settings.mailpit.uiAuthParameter
    };
}

function operationalSettings(
    settings: EnvironmentSettings,
    hosts: HostNaming
): Omit<EnvironmentConfig, 'name' | 'account' | 'region' | 'domain' | 'apiHost' | 'appHost' | 'shared' | 'imagePullAccounts'> {
    return {
        githubRepository: settings.githubRepository,
        githubSubjects: settings.githubSubjects,
        imageRetentionCount: settings.imageRetentionCount,
        architecture: settings.architecture,
        spotCompute: settings.spotCompute,
        offHoursShutdown: settings.offHoursShutdown,
        mailpit: mailpit(settings, hosts),
        otlpEndpointParameter: settings.otlpEndpointParameter,
        otlpHeadersParameter: settings.otlpHeadersParameter
    };
}

export function fromEnvironment(name: EnvironmentName, env: NodeJS.ProcessEnv): EnvironmentConfig {
    const settings: EnvironmentSettings = SETTINGS[name];
    const suffix: string = suffixOf(name);
    const domainName: string = domain(env);
    const hosts: HostNaming = { prefix: hostPrefix(env), domain: domainName };
    return {
        name,
        account: account(env, `AWS_ACCOUNT_ID_${suffix}`),
        region: settings.region,
        domain: domainName,
        apiHost: hostOf('api', settings, hosts),
        appHost: hostOf('app', settings, hosts),
        shared: shared(env, `SHARED_INFRA_${suffix}`),
        imagePullAccounts: imagePullAccounts(env),
        ...operationalSettings(settings, hosts)
    };
}
