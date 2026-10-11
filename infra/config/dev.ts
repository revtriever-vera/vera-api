import type { EnvironmentSettings } from './environment';

export const dev: EnvironmentSettings = {
    name: 'dev',
    region: 'us-east-1',
    hostSuffix: '-dev',
    githubRepository: 'revtriever-vera/vera-api',
    githubSubjects: ['repo:revtriever-vera/vera-api:ref:refs/heads/main', 'repo:revtriever-vera/vera-api:pull_request'],
    imageRetentionCount: 20,
    architecture: 'x86_64',
    spotCompute: true,
    offHoursShutdown: true,
    mailpit: { hostPrefix: 'mail', uiAuthParameter: '/vera/mailpit-ui-auth' },
    otlpEndpointParameter: '/vera/observability/otlp-endpoint',
    otlpHeadersParameter: '/vera/otlp-headers'
};
