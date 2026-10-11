import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environment';

export const WILDCARD_CERTIFICATE_PARAMETER: string = '/vera/wildcard-certificate-arn';

export interface CertificateStackProps extends StackProps {
    readonly config: EnvironmentConfig;
}

export class CertificateStack extends Stack {
    public constructor(scope: Construct, id: string, props: CertificateStackProps) {
        super(scope, id, props);

        const certificate: Certificate = new Certificate(this, 'Wildcard', {
            domainName: `*.${props.config.domain}`,
            validation: CertificateValidation.fromDns()
        });

        new StringParameter(this, 'WildcardArn', {
            parameterName: WILDCARD_CERTIFICATE_PARAMETER,
            stringValue: certificate.certificateArn
        });

        new CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
        new CfnOutput(this, 'ValidationHint', {
            value: `Publique o CNAME de validacao mostrado no ACM no DNS de ${props.config.domain} para este deploy concluir`
        });
    }
}
