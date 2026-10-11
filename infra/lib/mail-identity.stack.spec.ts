import { describe, expect, it, vi } from 'vitest';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { synthesize } from '../bin/vera';
import { FAKE_DOMAIN, fakeConfig } from '../test/fixtures';

vi.setConfig({ testTimeout: 30_000 });

function mailTemplate(app: App, environment: string): Template {
    return Template.fromStack(app.node.findChild(`vera-mail-${environment}`) as Stack);
}

describe.each(['dev', 'prod'] as const)('a identidade do SES em %s', (environment) => {
    it('cria o domínio com DKIM fácil e MAIL FROM em bounce.<domínio>', () => {
        const template: Template = mailTemplate(synthesize([fakeConfig(environment)]), environment);

        template.hasResourceProperties('AWS::SES::EmailIdentity', {
            EmailIdentity: FAKE_DOMAIN,
            MailFromAttributes: { MailFromDomain: `bounce.${FAKE_DOMAIN}`, BehaviorOnMxFailure: 'USE_DEFAULT_VALUE' }
        });
        template.hasResourceProperties('AWS::SES::EmailIdentity', Match.not(Match.objectLike({ DkimSigningAttributes: Match.anyValue() })));
    });

    it('imprime os três registros DKIM e os de MAIL FROM que a zona precisa receber', () => {
        const template: Template = mailTemplate(synthesize([fakeConfig(environment)]), environment);

        expect(Object.keys(template.findOutputs('*')).sort()).toEqual([
            'DkimRecord1',
            'DkimRecord2',
            'DkimRecord3',
            'MailFromMx',
            'MailFromSpf'
        ]);
    });
});
