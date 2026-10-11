import { describe, expect, it, vi } from 'vitest';
import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { synthesize } from '../bin/vera';
import { FAKE_DOMAIN, FAKE_SHARED, fakeConfig } from '../test/fixtures';

vi.setConfig({ testTimeout: 30_000 });

describe('a pilha de dados', () => {
    it('cria o security group da Vera e libera Postgres e Redis nos grupos compartilhados', () => {
        const app = synthesize([fakeConfig('prod')]);
        const template: Template = Template.fromStack(app.node.findChild('vera-data-prod') as Stack);

        template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
        template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', { GroupId: FAKE_SHARED.databaseSecurityGroupId, FromPort: 5432 });
        template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', { GroupId: FAKE_SHARED.redisSecurityGroupId, FromPort: 6379 });
    });
});

describe('a chave dos segredos', () => {
    it('existe com rotação anual, alias por ambiente e é retida na remoção', () => {
        const app = synthesize([fakeConfig('prod')]);
        const template: Template = Template.fromStack(app.node.findChild('vera-data-prod') as Stack);

        template.resourceCountIs('AWS::KMS::Key', 1);
        template.hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true });
        template.hasResource('AWS::KMS::Key', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
        template.hasResourceProperties('AWS::KMS::Alias', { AliasName: 'alias/vera-secrets-prod' });
    });

    it('não grava ID de conta nem ARN literal na pilha', () => {
        const app = synthesize([fakeConfig('dev')]);
        const template: Template = Template.fromStack(app.node.findChild('vera-data-dev') as Stack);
        const keys: Record<string, { Properties: Record<string, unknown> }> = template.findResources('AWS::KMS::Key') as Record<
            string,
            { Properties: Record<string, unknown> }
        >;

        expect(JSON.stringify(Object.values(keys).map((key) => key.Properties['Description']))).not.toMatch(/\d{12}|arn:aws/);
    });
});

describe('a pilha de certificado', () => {
    it('pede o curinga validado por DNS e guarda o ARN no SSM', () => {
        const app = synthesize([fakeConfig('prod')]);
        const template: Template = Template.fromStack(app.node.findChild('vera-cert-prod') as Stack);

        template.hasResourceProperties('AWS::CertificateManager::Certificate', {
            DomainName: `*.${FAKE_DOMAIN}`,
            ValidationMethod: 'DNS'
        });
        template.hasResourceProperties('AWS::SSM::Parameter', { Name: '/vera/wildcard-certificate-arn' });
    });
});
