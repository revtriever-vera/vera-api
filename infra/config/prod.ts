import type { EnvironmentSettings } from './environment';

export const prod: EnvironmentSettings = {
    name: 'prod',
    region: 'us-east-1',
    hostSuffix: '',
    githubRepository: 'revtriever-vera/vera-api',
    githubSubjects: ['repo:revtriever-vera/vera-api:environment:production'],
    imageRetentionCount: 50,
    architecture: 'x86_64',
    spotCompute: false,
    offHoursShutdown: false,
    mailpit: null,
    otlpEndpointParameter: '/vera/observability/otlp-endpoint',
    otlpHeadersParameter: '/vera/otlp-headers'
};
