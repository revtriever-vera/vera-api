import { EnvironmentConfig, EnvironmentName, fromEnvironment, SharedInfrastructureConfig } from '../config/environment';

export const FAKE_ACCOUNT_DEV: string = '000000000001';
export const FAKE_ACCOUNT_PROD: string = '000000000002';
export const FAKE_ACCOUNT_OTHER: string = '000000000003';
export const FAKE_DOMAIN: string = 'vera.example.test';

export const FAKE_SHARED: SharedInfrastructureConfig = {
    vpcId: 'vpc-00000000',
    availabilityZones: ['us-east-1a', 'us-east-1b'],
    publicSubnetIds: ['subnet-00000001', 'subnet-00000002'],
    databaseInstanceId: 'fake-database-instance',
    databaseEndpoint: 'fake-database.example.test',
    databaseSecurityGroupId: 'sg-00000001',
    redisEndpoint: 'fake-redis.example.test:6379',
    redisSecurityGroupId: 'sg-00000002',
    openIdConnectProviderArn: 'arn:aws:iam::000000000000:oidc-provider/oidc.example.test'
};

export function fakeEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
        AWS_ACCOUNT_ID_DEV: FAKE_ACCOUNT_DEV,
        AWS_ACCOUNT_ID_PROD: FAKE_ACCOUNT_PROD,
        SHARED_INFRA_DEV: JSON.stringify(FAKE_SHARED),
        SHARED_INFRA_PROD: JSON.stringify(FAKE_SHARED),
        VERA_DOMAIN: FAKE_DOMAIN,
        ...overrides
    };
}

export function fakeConfig(name: EnvironmentName, overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
    return { ...fromEnvironment(name, fakeEnvironment()), ...overrides };
}
