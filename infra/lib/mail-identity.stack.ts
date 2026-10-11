import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { DkimIdentity, EmailIdentity, Identity, MailFromBehaviorOnMxFailure } from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environment';

export interface MailIdentityStackProps extends StackProps {
    readonly config: EnvironmentConfig;
}

export function mailFromDomainOf(config: EnvironmentConfig): string {
    return `bounce.${config.domain}`;
}

export class MailIdentityStack extends Stack {
    public readonly identity: EmailIdentity;

    public constructor(scope: Construct, id: string, props: MailIdentityStackProps) {
        super(scope, id, props);

        this.identity = new EmailIdentity(this, 'Domain', {
            identity: Identity.domain(props.config.domain),
            dkimIdentity: DkimIdentity.easyDkim(),
            mailFromDomain: mailFromDomainOf(props.config),
            mailFromBehaviorOnMxFailure: MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE
        });

        this.identity.dkimRecords.forEach((record, index: number): void => {
            new CfnOutput(this, `DkimRecord${String(index + 1)}`, { value: `${record.name} CNAME ${record.value}` });
        });
        new CfnOutput(this, 'MailFromMx', {
            value: `${mailFromDomainOf(props.config)} MX 10 feedback-smtp.${this.region}.amazonses.com`
        });
        new CfnOutput(this, 'MailFromSpf', {
            value: `${mailFromDomainOf(props.config)} TXT "v=spf1 include:amazonses.com ~all"`
        });
    }
}
