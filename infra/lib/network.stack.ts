import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { IVpc, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository, TagStatus } from 'aws-cdk-lib/aws-ecr';
import {
    AccountPrincipal,
    Effect,
    IOpenIdConnectProvider,
    OpenIdConnectProvider,
    PolicyStatement,
    Role,
    WebIdentityPrincipal
} from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environment';

const GITHUB_AUDIENCE: string = 'sts.amazonaws.com';
const CDK_QUALIFIER: string = 'hnb659fds';

export interface NetworkStackProps extends StackProps {
    readonly config: EnvironmentConfig;
}

export class NetworkStack extends Stack {
    public readonly vpc: IVpc;
    public readonly repository: Repository;

    public constructor(scope: Construct, id: string, props: NetworkStackProps) {
        super(scope, id, props);

        this.vpc = this.importVpc(props.config);
        this.repository = this.buildRepository(props.config);
        this.buildDeployRole(props.config);

        new CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
        new CfnOutput(this, 'RepositoryUri', { value: this.repository.repositoryUri });
    }

    private importVpc(config: EnvironmentConfig): IVpc {
        return Vpc.fromVpcAttributes(this, 'Vpc', {
            vpcId: config.shared.vpcId,
            availabilityZones: [...config.shared.availabilityZones],
            publicSubnetIds: [...config.shared.publicSubnetIds]
        });
    }

    private buildRepository(config: EnvironmentConfig): Repository {
        const repository: Repository = new Repository(this, 'ApiRepository', {
            repositoryName: 'vera-api',
            imageScanOnPush: true,
            removalPolicy: RemovalPolicy.RETAIN,
            lifecycleRules: [{ maxImageCount: config.imageRetentionCount, tagStatus: TagStatus.ANY }]
        });
        for (const account of config.imagePullAccounts) {
            repository.grantPull(new AccountPrincipal(account));
        }
        return repository;
    }

    private buildDeployRole(config: EnvironmentConfig): Role {
        const provider: IOpenIdConnectProvider = OpenIdConnectProvider.fromOpenIdConnectProviderArn(
            this,
            'GithubOidc',
            config.shared.openIdConnectProviderArn
        );

        const role: Role = new Role(this, 'GithubDeployRole', {
            roleName: `vera-github-deploy-${config.name}`,
            assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
                StringEquals: { 'token.actions.githubusercontent.com:aud': GITHUB_AUDIENCE },
                StringLike: { 'token.actions.githubusercontent.com:sub': [...config.githubSubjects] }
            })
        });

        role.addToPolicy(this.assumeCdkRoles(config));
        for (const statement of this.migrationStatements(config)) {
            role.addToPolicy(statement);
        }
        this.repository.grantPullPush(role);
        new CfnOutput(this, 'GithubDeployRoleArn', { value: role.roleArn });
        return role;
    }

    private migrationStatements(config: EnvironmentConfig): PolicyStatement[] {
        return [
            this.cloudformationDescribeStatement(config),
            ...this.ecsStatements(config),
            ...this.passRoleAndLogStatements(config),
            ...this.wakeStatements(config)
        ];
    }

    private cloudformationDescribeStatement(config: EnvironmentConfig): PolicyStatement {
        return this.policyStatement(
            ['cloudformation:DescribeStacks'],
            [`arn:aws:cloudformation:${config.region}:${config.account}:stack/vera-*/*`]
        );
    }

    private ecsStatements(config: EnvironmentConfig): PolicyStatement[] {
        const region: string = config.region;
        const account: string = config.account;
        const cluster: string = `vera-${config.name}`;
        const migrationTaskArn: string = `arn:aws:ecs:${region}:${account}:task-definition/vera-migrate-${config.name}:*`;
        const clusterTaskArn: string = `arn:aws:ecs:${region}:${account}:task/${cluster}/*`;
        return [
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['ecs:RunTask'],
                resources: [migrationTaskArn],
                conditions: { ArnEquals: { 'ecs:cluster': `arn:aws:ecs:${region}:${account}:cluster/${cluster}` } }
            }),
            this.policyStatement(['ecs:DescribeTasks'], [clusterTaskArn]),
            this.policyStatement(['ecs:DescribeServices'], [`arn:aws:ecs:${region}:${account}:service/${cluster}/*`]),
            this.policyStatement(['ecs:RegisterTaskDefinition', 'ecs:DescribeTaskDefinition'], ['*'])
        ];
    }

    private policyStatement(actions: readonly string[], resources: readonly string[]): PolicyStatement {
        return new PolicyStatement({ effect: Effect.ALLOW, actions: [...actions], resources: [...resources] });
    }

    private wakeStatements(config: EnvironmentConfig): PolicyStatement[] {
        if (!config.offHoursShutdown) {
            return [];
        }
        return [
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['rds:DescribeDBInstances', 'rds:StartDBInstance'],
                resources: [`arn:aws:rds:${config.region}:${config.account}:db:${config.shared.databaseInstanceId}`]
            })
        ];
    }

    private passRoleAndLogStatements(config: EnvironmentConfig): PolicyStatement[] {
        return [
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['iam:PassRole'],
                resources: [`arn:aws:iam::${config.account}:role/vera-app-${config.name}-*`],
                conditions: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } }
            }),
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['logs:GetLogEvents'],
                resources: [`arn:aws:logs:${config.region}:${config.account}:log-group:/vera/${config.name}/*`]
            })
        ];
    }

    private assumeCdkRoles(config: EnvironmentConfig): PolicyStatement {
        const roles: string[] = ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map(
            (kind: string) => `arn:aws:iam::${config.account}:role/cdk-${CDK_QUALIFIER}-${kind}-role-${config.account}-${config.region}`
        );
        return new PolicyStatement({ effect: Effect.ALLOW, actions: ['sts:AssumeRole'], resources: roles });
    }
}
