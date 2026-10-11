import { App, Environment, Stack, Tags } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { EnvironmentConfig, EnvironmentName, fromEnvironment } from '../config/environment';
import { CertificateStack } from '../lib/certificate.stack';
import { AppStack } from '../lib/app.stack';
import { DataStack } from '../lib/data.stack';
import { MailIdentityStack } from '../lib/mail-identity.stack';
import { NetworkStack } from '../lib/network.stack';

const DEFAULT_IMAGE_TAG: string = 'latest';
const ALL_ENVIRONMENTS: readonly EnvironmentName[] = ['dev', 'prod'];

function awsEnvironment(config: EnvironmentConfig): Environment {
    return { account: config.account, region: config.region };
}

function tagStacks(config: EnvironmentConfig, stacks: readonly Stack[]): void {
    for (const stack of stacks) {
        Tags.of(stack).add('project', 'vera');
        Tags.of(stack).add('environment', config.name);
    }
}

function certificateStack(app: App, config: EnvironmentConfig): CertificateStack {
    return new CertificateStack(app, `vera-cert-${config.name}`, {
        env: awsEnvironment(config),
        config,
        description: `Wildcard certificate for *.${config.domain} - ${config.name}. Manual deploy: validation waits for the DNS CNAME.`
    });
}

function mailIdentityStack(app: App, config: EnvironmentConfig): MailIdentityStack {
    return new MailIdentityStack(app, `vera-mail-${config.name}`, {
        env: awsEnvironment(config),
        config,
        description: `SES identity for ${config.domain}: DKIM and MAIL FROM - ${config.name}. Manual deploy: DKIM waits for the DNS CNAMEs.`
    });
}

function networkStack(app: App, config: EnvironmentConfig): NetworkStack {
    return new NetworkStack(app, `vera-network-${config.name}`, {
        env: awsEnvironment(config),
        config,
        description: `Shared network, image registry and deploy role - ${config.name}`
    });
}

function dataStack(app: App, config: EnvironmentConfig, vpc: IVpc): DataStack {
    return new DataStack(app, `vera-data-${config.name}`, {
        env: awsEnvironment(config),
        config,
        vpc,
        description: `Shared Postgres and Redis, and the vera security group - ${config.name}`
    });
}

function appStack(app: App, config: EnvironmentConfig, network: NetworkStack, data: DataStack, imageTag: string): AppStack {
    return new AppStack(app, `vera-app-${config.name}`, {
        env: awsEnvironment(config),
        config,
        vpc: network.vpc,
        repository: network.repository,
        appSecurityGroup: data.appSecurityGroup,
        redisEndpoint: data.redisEndpoint,
        imageTag,
        description: `Fargate service with the Cloudflare tunnel, migration task and mail feedback - ${config.name}`
    });
}

function buildEnvironmentStacks(app: App, config: EnvironmentConfig, imageTag: string): void {
    const certificates: CertificateStack = certificateStack(app, config);
    const mailIdentity: MailIdentityStack = mailIdentityStack(app, config);
    const network: NetworkStack = networkStack(app, config);
    const data: DataStack = dataStack(app, config, network.vpc);
    const application: AppStack = appStack(app, config, network, data, imageTag);
    tagStacks(config, [certificates, mailIdentity, network, data, application]);
}

export function selectedEnvironments(env: NodeJS.ProcessEnv): readonly EnvironmentName[] {
    const raw: string = env['VERA_ENVIRONMENTS'] ?? '';
    if (raw.trim().length === 0) {
        return ALL_ENVIRONMENTS;
    }
    const requested: Set<string> = new Set(raw.split(',').map((value: string): string => value.trim()));
    const known: Set<string> = new Set(ALL_ENVIRONMENTS);
    const unknown: string[] = [...requested].filter((name: string): boolean => !known.has(name));
    if (unknown.length > 0) {
        throw new Error(`VERA_ENVIRONMENTS inválida: ${unknown.join(', ')}. Use dev, prod ou dev,prod`);
    }
    return ALL_ENVIRONMENTS.filter((name: EnvironmentName): boolean => requested.has(name));
}

export function synthesize(environments: readonly EnvironmentConfig[], imageTag: string = DEFAULT_IMAGE_TAG): App {
    const app: App = new App();
    for (const config of environments) {
        buildEnvironmentStacks(app, config, imageTag);
    }
    return app;
}

export function synthesizeFromEnvironment(env: NodeJS.ProcessEnv): App {
    const configs: EnvironmentConfig[] = selectedEnvironments(env).map((name: EnvironmentName): EnvironmentConfig =>
        fromEnvironment(name, env)
    );
    const imageTag: string = env['IMAGE_TAG']?.trim() || DEFAULT_IMAGE_TAG;
    return synthesize(configs, imageTag);
}

if (require.main === module) {
    synthesizeFromEnvironment(process.env);
}
