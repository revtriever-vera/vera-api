import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { ISecurityGroup, IVpc, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Key } from 'aws-cdk-lib/aws-kms';
import { DatabaseInstance, IDatabaseInstance } from 'aws-cdk-lib/aws-rds';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environment';

const DB_PORT: number = 5432;
const DB_ENDPOINT_PARAMETER: string = '/vera/database-endpoint';
const REDIS_PORT: number = 6379;

export function secretsKeyAlias(environmentName: string): string {
    return `alias/vera-secrets-${environmentName}`;
}

export interface DataStackProps extends StackProps {
    readonly config: EnvironmentConfig;
    readonly vpc: IVpc;
}

export class DataStack extends Stack {
    public readonly appSecurityGroup: SecurityGroup;
    public readonly database: IDatabaseInstance;
    public readonly secretsKey: Key;
    public readonly redisEndpoint: string;

    public constructor(scope: Construct, id: string, props: DataStackProps) {
        super(scope, id, props);

        this.appSecurityGroup = new SecurityGroup(this, 'AppSecurityGroup', {
            vpc: props.vpc,
            description: 'vera tasks. No inbound rule: ingress is the Cloudflare Tunnel, over an outbound connection.',
            allowAllOutbound: true
        });

        this.secretsKey = this.buildSecretsKey(props);
        this.database = this.importDatabase(props);
        this.redisEndpoint = props.config.shared.redisEndpoint;
        this.allowAppOn(props.config.shared.databaseSecurityGroupId, 'Database', DB_PORT);
        this.allowAppOn(props.config.shared.redisSecurityGroupId, 'Redis', REDIS_PORT);
        this.buildOutputs(props);
    }

    private buildOutputs(props: DataStackProps): void {
        new CfnOutput(this, 'DatabaseInstanceId', { value: this.database.instanceIdentifier });
        new CfnOutput(this, 'DatabaseEndpoint', { value: this.database.dbInstanceEndpointAddress });
        new StringParameter(this, 'DatabaseEndpointParameter', {
            parameterName: DB_ENDPOINT_PARAMETER,
            stringValue: this.database.dbInstanceEndpointAddress
        });
        new CfnOutput(this, 'DatabasePort', { value: this.database.dbInstanceEndpointPort });
        new CfnOutput(this, 'RedisConfigurationEndpoint', { value: this.redisEndpoint });
        new CfnOutput(this, 'AppSecurityGroupId', { value: this.appSecurityGroup.securityGroupId });
        new CfnOutput(this, 'SecretsKeyAlias', { value: secretsKeyAlias(props.config.name) });
    }

    private buildSecretsKey(props: DataStackProps): Key {
        return new Key(this, 'SecretsKey', {
            alias: secretsKeyAlias(props.config.name),
            description: `Envelope encryption of user credentials stored by vera - ${props.config.name}`,
            enableKeyRotation: true,
            removalPolicy: RemovalPolicy.RETAIN
        });
    }

    private importDatabase(props: DataStackProps): IDatabaseInstance {
        return DatabaseInstance.fromDatabaseInstanceAttributes(this, 'Database', {
            instanceIdentifier: props.config.shared.databaseInstanceId,
            instanceEndpointAddress: props.config.shared.databaseEndpoint,
            port: DB_PORT,
            securityGroups: []
        });
    }

    private allowAppOn(securityGroupId: string, name: string, port: number): void {
        const shared: ISecurityGroup = SecurityGroup.fromSecurityGroupId(this, `Shared${name}SecurityGroup`, securityGroupId, {
            mutable: true
        });
        shared.addIngressRule(this.appSecurityGroup, Port.tcp(port), `vera ${name.toLowerCase()}`);
    }
}
