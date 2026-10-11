import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { ISecurityGroup, IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import {
    AwsLogDriver,
    Cluster,
    ContainerDefinition,
    ContainerDependencyCondition,
    ContainerImage,
    CpuArchitecture,
    DeploymentControllerType,
    FargateService,
    FargateTaskDefinition,
    HealthCheck,
    OperatingSystemFamily,
    Protocol,
    Secret as EcsSecret
} from 'aws-cdk-lib/aws-ecs';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ConfigurationSet, EmailSendingEvent, EventDestination } from 'aws-cdk-lib/aws-ses';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { SqsSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { IStringParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvironmentConfig, MailpitEnvironmentConfig } from '../config/environment';
import { APP_PORT, MAILPIT_SMTP_PORT, MAILPIT_UI_PORT } from '../config/ports';
import { secretsKeyAlias } from './data.stack';
import { OffHoursSchedule } from './off-hours-schedule';

const MIGRATION_CPU: number = 256;
const MIGRATION_MEMORY_MIB: number = 1024;
const SERVICE_CPU: number = 512;
const SERVICE_MEMORY_MIB: number = 2048;
const LOG_RETENTION: RetentionDays = RetentionDays.ONE_WEEK;
const DRAIN_SECONDS: number = 120;
const TUNNEL_IMAGE: string = 'cloudflare/cloudflared:2026.9.3';
const MAILPIT_IMAGE: string = 'axllent/mailpit:v1.31';
const MAILPIT_MEMORY_MIB: number = 256;
const MAILPIT_MAX_MESSAGES: number = 500;
const MAIL_FEEDBACK_VISIBILITY_SECONDS: number = 90;
const MAIL_FEEDBACK_MAX_RECEIVES: number = 5;
const MAIL_FEEDBACK_DLQ_RETENTION_DAYS: number = 14;
const SECRET_PARAMETERS: Readonly<Record<string, string>> = {
    DATABASE_URL: '/vera/database-url',
    CRYPTO_KEY_HEX: '/vera/crypto-key-hex',
    JWT_SECRET: '/vera/jwt-secret',
    SWAGGER_PASSWORD: '/vera/swagger-password',
    QUEUES_DASHBOARD_PASSWORD: '/vera/queues-dashboard-password',
    GOOGLE_CLIENT_ID: '/vera/google-client-id',
    FACEBOOK_APP_ID: '/vera/facebook-app-id',
    FACEBOOK_APP_SECRET: '/vera/facebook-app-secret',
    BRAPI_TOKEN: '/vera/brapi-token',
    FINNHUB_API_KEY: '/vera/finnhub-api-key',
    TWELVEDATA_API_KEY: '/vera/twelvedata-api-key',
    ALPHAVANTAGE_API_KEY: '/vera/alphavantage-api-key',
    COINGECKO_API_KEY: '/vera/coingecko-api-key'
};
const OTLP_PROTOCOL: string = 'http/protobuf';
const TUNNEL_TOKEN_PARAMETER: string = '/vera/tunnel-token';
const EVERYONE: string = '*';
const SEALER_APP_CONTEXT: string = 'vera';

export interface AppStackProps extends StackProps {
    readonly config: EnvironmentConfig;
    readonly vpc: IVpc;
    readonly repository: IRepository;
    readonly appSecurityGroup: ISecurityGroup;
    readonly redisEndpoint: string;
    readonly secretsKey: IKey;
    readonly imageTag: string;
}

interface MailFeedback {
    readonly queue: Queue;
    readonly configurationSetName: string;
}

export class AppStack extends Stack {
    public readonly cluster: Cluster;
    public readonly migrationTask: FargateTaskDefinition;
    public readonly service: FargateService;
    private readonly mailFeedback: MailFeedback;

    public constructor(scope: Construct, id: string, props: AppStackProps) {
        super(scope, id, props);

        this.cluster = new Cluster(this, 'Cluster', {
            vpc: props.vpc,
            clusterName: `vera-${props.config.name}`,
            enableFargateCapacityProviders: props.config.spotCompute
        });
        this.mailFeedback = this.buildMailFeedback(props);
        this.migrationTask = this.buildMigrationTask(props);
        this.service = this.buildService(props);
        this.buildOffHoursSchedule(props);
        this.buildOutputs(props);
    }

    private buildOutputs(props: AppStackProps): void {
        new CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName });
        new CfnOutput(this, 'MigrationTaskDefinitionArn', { value: this.migrationTask.taskDefinitionArn });
        new CfnOutput(this, 'MigrationTaskFamily', { value: this.migrationTask.family });
        new CfnOutput(this, 'ServiceName', { value: this.service.serviceName });
        new CfnOutput(this, 'ApiUrl', { value: `https://${props.config.apiHost}` });
        new CfnOutput(this, 'AppSecurityGroupId', { value: props.appSecurityGroup.securityGroupId });
        if (props.config.mailpit !== null) {
            new CfnOutput(this, 'MailUrl', { value: `https://${props.config.mailpit.host}` });
        }
    }

    private buildMailFeedback(props: AppStackProps): MailFeedback {
        const name: string = props.config.name;
        const configurationSet: ConfigurationSet = new ConfigurationSet(this, 'MailConfigurationSet', {
            configurationSetName: `vera-${name}`
        });
        const topic: Topic = new Topic(this, 'MailFeedbackTopic', { topicName: `vera-mail-feedback-${name}` });
        this.attachMailFeedbackDestination(configurationSet, topic);
        const deadLetter: Queue = new Queue(this, 'MailFeedbackDlq', {
            queueName: `vera-mail-feedback-dlq-${name}`,
            retentionPeriod: Duration.days(MAIL_FEEDBACK_DLQ_RETENTION_DAYS)
        });
        const queue: Queue = new Queue(this, 'MailFeedbackQueue', {
            queueName: `vera-mail-feedback-${name}`,
            visibilityTimeout: Duration.seconds(MAIL_FEEDBACK_VISIBILITY_SECONDS),
            deadLetterQueue: { queue: deadLetter, maxReceiveCount: MAIL_FEEDBACK_MAX_RECEIVES }
        });
        topic.addSubscription(new SqsSubscription(queue));
        return { queue, configurationSetName: configurationSet.configurationSetName };
    }

    private attachMailFeedbackDestination(configurationSet: ConfigurationSet, topic: Topic): void {
        configurationSet.addEventDestination('Feedback', {
            destination: EventDestination.snsTopic(topic),
            events: [
                EmailSendingEvent.DELIVERY,
                EmailSendingEvent.BOUNCE,
                EmailSendingEvent.COMPLAINT,
                EmailSendingEvent.OPEN,
                EmailSendingEvent.REJECT,
                EmailSendingEvent.RENDERING_FAILURE
            ]
        });
    }

    private buildMigrationTask(props: AppStackProps): FargateTaskDefinition {
        const task: FargateTaskDefinition = new FargateTaskDefinition(this, 'MigrationTask', {
            family: `vera-migrate-${props.config.name}`,
            cpu: MIGRATION_CPU,
            memoryLimitMiB: MIGRATION_MEMORY_MIB,
            runtimePlatform: this.platform(props.config)
        });

        task.addContainer('migrate', {
            image: ContainerImage.fromEcrRepository(props.repository, props.imageTag),
            command: ['npm', 'run', 'migrate:latest'],
            essential: true,
            environment: this.oneShotEnvironment(props),
            secrets: this.secrets(props.config, 'MigrationSecret'),
            logging: this.logs('MigrationLogs', `/vera/${props.config.name}/migrate`, 'migrate'),
            stopTimeout: Duration.seconds(30)
        });

        return task;
    }

    private buildService(props: AppStackProps): FargateService {
        const task: FargateTaskDefinition = new FargateTaskDefinition(this, 'ApiTask', {
            family: `vera-api-${props.config.name}`,
            cpu: SERVICE_CPU,
            memoryLimitMiB: SERVICE_MEMORY_MIB,
            runtimePlatform: this.platform(props.config)
        });
        this.grantTaskPermissions(task, props);
        this.mailFeedback.queue.grantConsumeMessages(task.taskRole);
        this.wireServiceContainers(task, props);
        return this.fargateService(task, props);
    }

    private wireServiceContainers(task: FargateTaskDefinition, props: AppStackProps): void {
        const api: ContainerDefinition = this.addApiContainer(task, props);
        if (props.config.mailpit !== null) {
            this.addMailpitContainer(task, props, props.config.mailpit);
        }
        this.addTunnelContainer(task, props, [api]);
    }

    private fargateService(task: FargateTaskDefinition, props: AppStackProps): FargateService {
        return new FargateService(this, 'Service', {
            cluster: this.cluster,
            taskDefinition: task,
            desiredCount: 1,
            assignPublicIp: true,
            vpcSubnets: { subnetType: SubnetType.PUBLIC },
            securityGroups: [props.appSecurityGroup],
            circuitBreaker: { rollback: true },
            deploymentController: { type: DeploymentControllerType.ECS },
            minHealthyPercent: 0,
            maxHealthyPercent: 200,
            ...(props.config.spotCompute ? { capacityProviderStrategies: [{ capacityProvider: 'FARGATE_SPOT', weight: 1 }] } : {})
        });
    }

    private buildOffHoursSchedule(props: AppStackProps): void {
        if (!props.config.offHoursShutdown) {
            return;
        }
        new OffHoursSchedule(this, 'OffHours', {
            environmentName: props.config.name,
            region: props.config.region,
            account: props.config.account,
            clusterName: this.cluster.clusterName,
            serviceName: this.service.serviceName
        });
    }

    private addApiContainer(task: FargateTaskDefinition, props: AppStackProps): ContainerDefinition {
        return task.addContainer('api', {
            image: ContainerImage.fromEcrRepository(props.repository, props.imageTag),
            essential: true,
            environment: this.containerEnvironment(props),
            secrets: this.secrets(props.config),
            portMappings: [{ containerPort: APP_PORT, protocol: Protocol.TCP }],
            logging: this.logs('ApiLogs', `/vera/${props.config.name}/api`, 'api'),
            stopTimeout: Duration.seconds(DRAIN_SECONDS),
            healthCheck: {
                command: [
                    'CMD-SHELL',
                    `node -e "fetch('http://localhost:${String(APP_PORT)}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
                ],
                interval: Duration.seconds(30),
                timeout: Duration.seconds(5),
                retries: 3,
                startPeriod: Duration.seconds(60)
            }
        });
    }

    private addMailpitContainer(task: FargateTaskDefinition, props: AppStackProps, mailpit: MailpitEnvironmentConfig): void {
        task.addContainer('mailpit', {
            image: ContainerImage.fromRegistry(MAILPIT_IMAGE),
            essential: false,
            memoryLimitMiB: MAILPIT_MEMORY_MIB,
            environment: this.mailpitEnvironment(),
            secrets: { MP_UI_AUTH: this.secretFrom('MailpitUiAuth', mailpit.uiAuthParameter) },
            portMappings: [
                { containerPort: MAILPIT_SMTP_PORT, protocol: Protocol.TCP },
                { containerPort: MAILPIT_UI_PORT, protocol: Protocol.TCP }
            ],
            logging: this.logs('MailpitLogs', `/vera/${props.config.name}/mailpit`, 'mailpit'),
            healthCheck: this.mailpitHealthCheck()
        });
    }

    private mailpitEnvironment(): Record<string, string> {
        return {
            MP_UI_BIND_ADDR: `0.0.0.0:${String(MAILPIT_UI_PORT)}`,
            MP_SMTP_BIND_ADDR: `0.0.0.0:${String(MAILPIT_SMTP_PORT)}`,
            MP_MAX_MESSAGES: String(MAILPIT_MAX_MESSAGES),
            MP_DISABLE_VERSION_CHECK: 'true'
        };
    }

    private mailpitHealthCheck(): HealthCheck {
        return {
            command: ['CMD', '/mailpit', 'readyz'],
            interval: Duration.seconds(30),
            timeout: Duration.seconds(5),
            retries: 3,
            startPeriod: Duration.seconds(15)
        };
    }

    private addTunnelContainer(task: FargateTaskDefinition, props: AppStackProps, apps: readonly ContainerDefinition[]): void {
        const tunnel: ContainerDefinition = task.addContainer('cloudflared', {
            image: ContainerImage.fromRegistry(TUNNEL_IMAGE),
            essential: true,
            command: ['tunnel', '--no-autoupdate', '--metrics', '0.0.0.0:2000', 'run'],
            secrets: { TUNNEL_TOKEN: this.secretFrom('TunnelToken', TUNNEL_TOKEN_PARAMETER) },
            logging: this.logs('TunnelLogs', `/vera/${props.config.name}/tunnel`, 'tunnel'),
            stopTimeout: Duration.seconds(30)
        });
        for (const app of apps) {
            tunnel.addContainerDependencies({ container: app, condition: ContainerDependencyCondition.HEALTHY });
        }
    }

    private grantTaskPermissions(task: FargateTaskDefinition, props: AppStackProps): void {
        task.addToTaskRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['ses:SendEmail', 'ses:SendRawEmail'],
                resources: [this.sesArn('identity', props.config.domain), this.sesArn('configuration-set', `vera-${props.config.name}`)]
            })
        );
        task.addToTaskRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
                resources: [props.secretsKey.keyArn],
                conditions: {
                    StringEquals: { 'kms:EncryptionContext:app': SEALER_APP_CONTEXT },
                    Null: { 'kms:EncryptionContextKeys': 'false' }
                }
            })
        );
    }

    private sesArn(resource: string, name: string): string {
        return this.formatArn({ service: 'ses', resource, resourceName: name });
    }

    private containerEnvironment(props: AppStackProps): Record<string, string> {
        return {
            ...this.appEnvironment(props),
            ...this.infraEnvironment(props),
            ...this.sealerEnvironment(props),
            ...this.mailEnvironment(props)
        };
    }

    private appEnvironment(props: AppStackProps): Record<string, string> {
        return {
            NODE_ENV: 'production',
            DEPLOY_ENV: props.config.name,
            IS_LOCAL: 'false',
            PORT: String(APP_PORT),
            LOG_LEVEL: 'info',
            DOCS_ENABLED: 'true',
            QUEUES_DASHBOARD_ENABLED: 'true',
            APP_VERSION: props.imageTag,
            COOKIE_SECURE: 'true',
            CORS_ORIGINS: `https://${props.config.appHost}`
        };
    }

    private infraEnvironment(props: AppStackProps): Record<string, string> {
        return {
            REDIS_NODES: props.redisEndpoint,
            REDIS_TLS: 'true',
            AWS_REGION: props.config.region,
            OTEL_SERVICE_NAME: 'vera-api',
            OTEL_EXPORTER_OTLP_ENDPOINT: StringParameter.valueForStringParameter(this, props.config.otlpEndpointParameter),
            OTEL_EXPORTER_OTLP_PROTOCOL: OTLP_PROTOCOL
        };
    }

    private sealerEnvironment(props: AppStackProps): Record<string, string> {
        return { SECRET_SEALER_DRIVER: 'kms', SECRET_SEALER_KMS_KEY_ID: secretsKeyAlias(props.config.name) };
    }

    private oneShotEnvironment(props: AppStackProps): Record<string, string> {
        return { ...this.containerEnvironment(props), DOCS_ENABLED: 'false', QUEUES_DASHBOARD_ENABLED: 'false' };
    }

    private mailEnvironment(props: AppStackProps): Record<string, string> {
        if (props.config.mailpit === null) {
            return this.sesEnvironment(props);
        }
        return {
            MAIL_DRIVER: 'smtp',
            MAIL_FROM_EMAIL: this.mailFrom(props),
            SMTP_HOST: 'localhost',
            SMTP_PORT: String(MAILPIT_SMTP_PORT),
            MAIL_ALLOWED_RECIPIENTS: EVERYONE
        };
    }

    private mailFrom(props: AppStackProps): string {
        return `no-reply@${props.config.domain}`;
    }

    private sesEnvironment(props: AppStackProps): Record<string, string> {
        return {
            MAIL_DRIVER: 'ses',
            MAIL_FROM_EMAIL: this.mailFrom(props),
            MAIL_ALLOWED_RECIPIENTS: EVERYONE,
            MAIL_CONFIGURATION_SET: this.mailFeedback.configurationSetName,
            MAIL_FEEDBACK_QUEUE_URL: this.mailFeedback.queue.queueUrl
        };
    }

    private secrets(config: EnvironmentConfig, idPrefix: string = 'Secret'): Record<string, EcsSecret> {
        const parameters: Record<string, string> = { ...SECRET_PARAMETERS };
        if (config.otlpHeadersParameter !== null) {
            parameters['OTEL_EXPORTER_OTLP_HEADERS'] = config.otlpHeadersParameter;
        }
        const entries: [string, EcsSecret][] = Object.entries(parameters).map(([name, parameter]: [string, string]) => [
            name,
            this.secretFrom(`${idPrefix}${name}`, parameter)
        ]);
        return Object.fromEntries(entries);
    }

    private secretFrom(id: string, parameterName: string): EcsSecret {
        const parameter: IStringParameter = StringParameter.fromSecureStringParameterAttributes(this, id, { parameterName });
        return EcsSecret.fromSsmParameter(parameter);
    }

    private logs(id: string, logGroupName: string, streamPrefix: string): AwsLogDriver {
        return new AwsLogDriver({
            streamPrefix,
            logGroup: new LogGroup(this, id, { logGroupName, retention: LOG_RETENTION, removalPolicy: RemovalPolicy.DESTROY })
        });
    }

    private platform(config: EnvironmentConfig): { cpuArchitecture: CpuArchitecture; operatingSystemFamily: OperatingSystemFamily } {
        return {
            cpuArchitecture: config.architecture === 'arm64' ? CpuArchitecture.ARM64 : CpuArchitecture.X86_64,
            operatingSystemFamily: OperatingSystemFamily.LINUX
        };
    }
}
