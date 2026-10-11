import { describe, expect, it, vi } from 'vitest';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { synthesize } from '../bin/vera';
import { EnvironmentName } from '../config/environment';
import { FAKE_DOMAIN, fakeConfig } from '../test/fixtures';

vi.setConfig({ testTimeout: 30_000 });

interface ContainerResource {
    readonly Name: string;
    readonly Environment?: readonly { readonly Name: string; readonly Value: unknown }[];
    readonly Secrets?: readonly { readonly Name: string; readonly ValueFrom: unknown }[];
    readonly PortMappings?: readonly { readonly ContainerPort: number }[];
    readonly Command?: readonly string[];
    readonly Essential?: boolean;
    readonly DependsOn?: readonly { readonly ContainerName: string; readonly Condition: string }[];
}

interface TaskDefinitionResource {
    readonly Properties: { readonly Family: string; readonly ContainerDefinitions: readonly ContainerResource[] };
}

function appTemplate(environment: EnvironmentName, overrides = {}): Template {
    const app: App = synthesize([fakeConfig(environment, overrides)]);
    return Template.fromStack(app.node.findChild(`vera-app-${environment}`) as Stack);
}

function taskContainers(template: Template, family: string): readonly ContainerResource[] {
    const definitions: TaskDefinitionResource[] = Object.values(
        template.findResources('AWS::ECS::TaskDefinition') as Record<string, TaskDefinitionResource>
    );
    const found: TaskDefinitionResource | undefined = definitions.find(
        (definition: TaskDefinitionResource): boolean => definition.Properties.Family === family
    );
    return found?.Properties.ContainerDefinitions ?? [];
}

function container(containers: readonly ContainerResource[], name: string): ContainerResource {
    const found: ContainerResource | undefined = containers.find((entry: ContainerResource): boolean => entry.Name === name);
    if (found === undefined) {
        throw new Error(`container ${name} ausente`);
    }
    return found;
}

describe('a task do serviço', () => {
    it('em prod roda api e cloudflared, sem mailpit', () => {
        const names: string[] = taskContainers(appTemplate('prod'), 'vera-api-prod').map((entry: ContainerResource): string => entry.Name);

        expect(names.sort()).toEqual(['api', 'cloudflared']);
    });

    it('em dev acrescenta o mailpit como container não essencial', () => {
        const containers: readonly ContainerResource[] = taskContainers(appTemplate('dev'), 'vera-api-dev');

        expect(containers.map((entry: ContainerResource): string => entry.Name).sort()).toEqual(['api', 'cloudflared', 'mailpit']);
        expect(container(containers, 'mailpit').Essential).toBe(false);
    });

    it('sem mailpit configurado, dev também não o cria', () => {
        const containers: readonly ContainerResource[] = taskContainers(appTemplate('dev', { mailpit: null }), 'vera-api-dev');

        expect(containers.map((entry: ContainerResource): string => entry.Name).sort()).toEqual(['api', 'cloudflared']);
    });

    it('só sobe o túnel depois que a api estiver saudável', () => {
        const tunnel: ContainerResource = container(taskContainers(appTemplate('prod'), 'vera-api-prod'), 'cloudflared');

        expect(tunnel.DependsOn).toEqual([{ ContainerName: 'api', Condition: 'HEALTHY' }]);
    });

    it('entrega DATABASE_URL e CRYPTO_KEY_HEX por segredo do SSM e nunca em texto puro', () => {
        const api: ContainerResource = container(taskContainers(appTemplate('prod'), 'vera-api-prod'), 'api');
        const secretNames: string[] = (api.Secrets ?? []).map((secret): string => secret.Name);
        const plainNames: string[] = (api.Environment ?? []).map((entry): string => entry.Name);

        expect(secretNames).toEqual(expect.arrayContaining(['DATABASE_URL', 'CRYPTO_KEY_HEX', 'OTEL_EXPORTER_OTLP_HEADERS']));
        for (const name of secretNames) {
            expect(plainNames).not.toContain(name);
        }
        expect(JSON.stringify(api.Secrets)).toContain('parameter/vera/database-url');
        expect(JSON.stringify(api.Secrets)).toContain('parameter/vera/crypto-key-hex');
    });

    it('omite o cabeçalho OTLP quando o ambiente não o configura', () => {
        const api: ContainerResource = container(
            taskContainers(appTemplate('prod', { otlpHeadersParameter: null }), 'vera-api-prod'),
            'api'
        );

        expect((api.Secrets ?? []).map((secret): string => secret.Name)).not.toContain('OTEL_EXPORTER_OTLP_HEADERS');
    });

    it('lê o token do túnel do SSM', () => {
        const tunnel: ContainerResource = container(taskContainers(appTemplate('prod'), 'vera-api-prod'), 'cloudflared');

        expect(JSON.stringify(tunnel.Secrets)).toContain('parameter/vera/tunnel-token');
    });

    it('libera CORS só para o host do front', () => {
        const api: ContainerResource = container(taskContainers(appTemplate('prod'), 'vera-api-prod'), 'api');

        expect(api.Environment).toContainEqual({ Name: 'CORS_ORIGINS', Value: `https://app.${FAKE_DOMAIN}` });
    });

    it('declara a porta da api só no container, sem ingresso de security group nesta pilha', () => {
        const template: Template = appTemplate('prod');
        const api: ContainerResource = container(taskContainers(template, 'vera-api-prod'), 'api');

        expect(api.PortMappings).toEqual([{ ContainerPort: 3333, Protocol: 'tcp' }]);
        template.resourceCountIs('AWS::EC2::SecurityGroup', 0);
        template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 0);
    });

    it('cria o serviço sem balanceador, com uma task, rollback e sem alta disponibilidade', () => {
        const template: Template = appTemplate('prod');

        template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0);
        template.hasResourceProperties('AWS::ECS::Service', {
            DesiredCount: 1,
            DeploymentConfiguration: Match.objectLike({
                MinimumHealthyPercent: 0,
                DeploymentCircuitBreaker: { Enable: true, Rollback: true }
            }),
            NetworkConfiguration: { AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: 'ENABLED' }) }
        });
    });

    it('usa Fargate Spot em dev e Fargate comum em prod', () => {
        appTemplate('dev').hasResourceProperties('AWS::ECS::Service', {
            CapacityProviderStrategy: [{ CapacityProvider: 'FARGATE_SPOT', Weight: 1 }]
        });
        appTemplate('prod').hasResourceProperties('AWS::ECS::Service', { LaunchType: 'FARGATE' });
    });
});

describe('a task de migração', () => {
    it('usa a família vera-migrate-<env> e roda migrate:latest', () => {
        const containers: readonly ContainerResource[] = taskContainers(appTemplate('prod'), 'vera-migrate-prod');

        expect(containers.map((entry: ContainerResource): string => entry.Name)).toEqual(['migrate']);
        expect(container(containers, 'migrate').Command).toEqual(['npm', 'run', 'migrate:latest']);
    });
});

describe('o off-hours', () => {
    it('existe em dev, com parada às 21h e retorno às 8h de Brasília', () => {
        const template: Template = appTemplate('dev');

        template.resourceCountIs('AWS::Scheduler::Schedule', 2);
        template.hasResourceProperties('AWS::Scheduler::Schedule', {
            ScheduleExpression: 'cron(0 21 * * ? *)',
            ScheduleExpressionTimezone: 'America/Sao_Paulo'
        });
        template.hasResourceProperties('AWS::Scheduler::Schedule', { ScheduleExpression: 'cron(0 8 * * ? *)' });
    });

    it('para o serviço com DesiredCount 0 e o religa com 1', () => {
        const schedules: Record<string, { Properties: { Target: { Input: unknown } } }> =
            appTemplate('dev').findResources('AWS::Scheduler::Schedule');
        const counts: string[] = Object.values(schedules).map(
            (schedule): string => /DesiredCount\\?":(\d+)/.exec(JSON.stringify(schedule.Properties.Target.Input))?.[1] ?? ''
        );

        expect(counts.sort()).toEqual(['0', '1']);
    });

    it('não existe em prod', () => {
        appTemplate('prod').resourceCountIs('AWS::Scheduler::Schedule', 0);
    });

    it('segue a flag offHoursShutdown e não o nome do ambiente', () => {
        appTemplate('prod', { offHoursShutdown: true }).resourceCountIs('AWS::Scheduler::Schedule', 2);
        appTemplate('dev', { offHoursShutdown: false }).resourceCountIs('AWS::Scheduler::Schedule', 0);
    });
});

describe('o feedback de e-mail', () => {
    it('cria conjunto de configuração, tópico, fila e fila morta com nomes da vera', () => {
        const template: Template = appTemplate('prod');

        template.hasResourceProperties('AWS::SES::ConfigurationSet', { Name: 'vera-prod' });
        template.hasResourceProperties('AWS::SNS::Topic', { TopicName: 'vera-mail-feedback-prod' });
        template.hasResourceProperties('AWS::SQS::Queue', { QueueName: 'vera-mail-feedback-prod' });
        template.hasResourceProperties('AWS::SQS::Queue', { QueueName: 'vera-mail-feedback-dlq-prod' });
        template.hasResourceProperties('AWS::SES::ConfigurationSetEventDestination', {
            EventDestination: Match.objectLike({
                MatchingEventTypes: ['delivery', 'bounce', 'complaint', 'open', 'reject', 'renderingFailure']
            })
        });
    });
});

describe('o escopo da pilha', () => {
    it.each(['dev', 'prod'] as const)('em %s não tem API Gateway, fila de webhook, Bedrock nem bucket', (environment) => {
        const template: Template = appTemplate(environment);

        template.resourceCountIs('AWS::ApiGateway::RestApi', 0);
        template.resourceCountIs('AWS::Bedrock::ApplicationInferenceProfile', 0);
        template.resourceCountIs('AWS::S3::Bucket', 0);
        const queues: string = JSON.stringify(template.findResources('AWS::SQS::Queue'));
        expect(queues).not.toContain('webhook');
        expect(JSON.stringify(template.toJSON())).not.toMatch(/bedrock:|s3:/);
    });
});

describe('a permissão de envio de e-mail', () => {
    it('limita o SES à identidade do domínio e ao conjunto vera-<env>', () => {
        const template: Template = appTemplate('prod');
        const statements: string = JSON.stringify(template.findResources('AWS::IAM::Policy'));

        expect(statements).toContain(`:identity/${FAKE_DOMAIN}`);
        expect(statements).toContain(':configuration-set/vera-prod');
        expect(statements).not.toMatch(/"ses:SendEmail"[^}]*"Resource":"\*"/);
    });
});

describe('os logs', () => {
    it('cria um grupo por container com retenção de uma semana', () => {
        const template: Template = appTemplate('dev');

        for (const name of ['api', 'migrate', 'tunnel', 'mailpit']) {
            template.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: `/vera/dev/${name}`, RetentionInDays: 7 });
        }
    });
});

describe('as saídas', () => {
    it('em prod publica as que o deploy lê, sem MailUrl', () => {
        const names: string[] = Object.keys(appTemplate('prod').findOutputs('*')).sort();

        expect(names).toEqual([
            'ApiUrl',
            'AppSecurityGroupId',
            'ClusterName',
            'MigrationTaskDefinitionArn',
            'MigrationTaskFamily',
            'ServiceName'
        ]);
    });

    it('em dev acrescenta MailUrl', () => {
        expect(Object.keys(appTemplate('dev').findOutputs('*'))).toContain('MailUrl');
    });

    it('a ApiUrl vem do host da configuração', () => {
        appTemplate('prod').hasOutput('ApiUrl', { Value: `https://api.${FAKE_DOMAIN}` });
    });
});
