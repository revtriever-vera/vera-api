import { describe, expect, it, vi } from 'vitest';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { synthesize } from '../bin/vera';
import { FAKE_ACCOUNT_PROD, FAKE_SHARED, fakeConfig } from '../test/fixtures';

vi.setConfig({ testTimeout: 30_000 });

interface PolicyResource {
    readonly Properties?: { readonly PolicyDocument?: { readonly Statement?: unknown[] } };
}

function networkTemplate(app: App, environment: string): Template {
    return Template.fromStack(app.node.findChild(`vera-network-${environment}`) as Stack);
}

function statementsOf(template: Template): string {
    const policies: Record<string, PolicyResource> = template.findResources('AWS::IAM::Policy');
    return JSON.stringify(
        Object.values(policies).flatMap((policy: PolicyResource): unknown[] => policy.Properties?.PolicyDocument?.Statement ?? [])
    );
}

describe('a rede', () => {
    it('não puxa imagem de conta nenhuma quando imagePullAccounts está vazio', () => {
        const template: Template = networkTemplate(synthesize([fakeConfig('dev', { imagePullAccounts: [] })]), 'dev');

        template.hasResourceProperties('AWS::ECR::Repository', Match.not(Match.objectLike({ RepositoryPolicyText: Match.anyValue() })));
    });

    it('deixa a conta listada puxar imagem do repositório', () => {
        const template: Template = networkTemplate(synthesize([fakeConfig('dev', { imagePullAccounts: [FAKE_ACCOUNT_PROD] })]), 'dev');
        const repositories: Record<string, { readonly Properties?: { readonly RepositoryPolicyText?: unknown } }> =
            template.findResources('AWS::ECR::Repository');
        const text: string = JSON.stringify(Object.values(repositories)[0]?.Properties?.RepositoryPolicyText ?? {});

        expect(text).toContain('ecr:BatchGetImage');
        expect(text).toContain(`:iam::${FAKE_ACCOUNT_PROD}:root`);
    });

    it('cria o repositório vera-api com scan no push', () => {
        const template: Template = networkTemplate(synthesize([fakeConfig('prod')]), 'prod');

        template.hasResourceProperties('AWS::ECR::Repository', {
            RepositoryName: 'vera-api',
            ImageScanningConfiguration: { ScanOnPush: true }
        });
    });

    it('dá ao papel de deploy sts:AssumeRole nas quatro roles do CDK', () => {
        const template: Template = networkTemplate(synthesize([fakeConfig('dev')]), 'dev');
        const assumed: string = statementsOf(template);

        template.hasResourceProperties('AWS::IAM::Role', { RoleName: 'vera-github-deploy-dev' });
        for (const kind of ['deploy', 'file-publishing', 'image-publishing', 'lookup']) {
            expect(assumed).toContain(`cdk-hnb659fds-${kind}-role`);
        }
    });

    it('restringe a task de migração à task-definition vera-migrate-<env>', () => {
        const statements: string = statementsOf(networkTemplate(synthesize([fakeConfig('dev')]), 'dev'));

        expect(statements).toContain('task-definition/vera-migrate-dev');
        expect(statements).toContain('ecs:RunTask');
        expect(statements).not.toContain('task-definition/vera-migrate-prod');
    });

    it('limita o ecs:RunTask ao cluster vera-<env> por condição ArnEquals', () => {
        const statements: string = statementsOf(networkTemplate(synthesize([fakeConfig('dev')]), 'dev'));

        expect(statements).toContain('"ArnEquals":{"ecs:cluster":"arn:aws:ecs:us-east-1:000000000001:cluster/vera-dev"}');
    });

    it('restringe o acordar do banco à instância compartilhada, sem curinga', () => {
        const statements: string = statementsOf(networkTemplate(synthesize([fakeConfig('dev')]), 'dev'));

        expect(statements).toContain(`:db:${FAKE_SHARED.databaseInstanceId}`);
        expect(statements).not.toContain(':db:*');
    });

    it('amarra o papel de dev ao main e a pull request do próprio repositório, nunca a fork', () => {
        const template: Template = networkTemplate(synthesize([fakeConfig('dev')]), 'dev');
        const roles: Record<string, { readonly Properties?: { readonly AssumeRolePolicyDocument?: unknown } }> =
            template.findResources('AWS::IAM::Role');
        const trust: string = JSON.stringify(Object.values(roles)[0]?.Properties?.AssumeRolePolicyDocument ?? {});

        expect(trust).toContain('repo:revtriever-vera/vera-api:ref:refs/heads/main');
        expect(trust).toContain('repo:revtriever-vera/vera-api:pull_request');
        expect(trust).not.toMatch(/repo:\*|repo:revtriever-vera\/\*|:sub":"\*/);
        expect(trust).toContain('sts.amazonaws.com');
    });

    it('amarra o papel de prod ao environment production', () => {
        const template: Template = networkTemplate(synthesize([fakeConfig('prod')]), 'prod');
        const roles: Record<string, { readonly Properties?: { readonly AssumeRolePolicyDocument?: unknown } }> =
            template.findResources('AWS::IAM::Role');
        const trust: string = JSON.stringify(Object.values(roles)[0]?.Properties?.AssumeRolePolicyDocument ?? {});

        expect(trust).toContain('repo:revtriever-vera/vera-api:environment:production');
        expect(trust).not.toContain('pull_request');
    });

    it('só concede acordar o banco (rds:StartDBInstance) quando o ambiente desliga fora de horário', () => {
        const withOffHours: string = statementsOf(networkTemplate(synthesize([fakeConfig('dev')]), 'dev'));
        const withoutOffHours: string = statementsOf(networkTemplate(synthesize([fakeConfig('dev', { offHoursShutdown: false })]), 'dev'));

        expect(withOffHours).toContain('rds:StartDBInstance');
        expect(withoutOffHours).not.toContain('rds:StartDBInstance');
    });
});
