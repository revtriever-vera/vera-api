import { Duration } from 'aws-cdk-lib';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';

const TIMEZONE: string = 'America/Sao_Paulo';

const SERVICE_STOP: string = 'cron(0 21 * * ? *)';
const SERVICE_START: string = 'cron(0 8 * * ? *)';

const ECS_UPDATE: string = ['arn', 'aws', 'scheduler', '', '', 'aws-sdk', 'ecs', 'updateService'].join(':');

const RETRY_ATTEMPTS: number = 5;
const FAILURE_RETENTION_DAYS: number = 14;

export interface OffHoursScheduleProps {
    readonly environmentName: string;
    readonly region: string;
    readonly account: string;
    readonly clusterName: string;
    readonly serviceName: string;
}

export class OffHoursSchedule extends Construct {
    public readonly failures: Queue;

    public constructor(scope: Construct, id: string, props: OffHoursScheduleProps) {
        super(scope, id);

        this.failures = new Queue(this, 'Failures', {
            queueName: `vera-schedule-failures-${props.environmentName}`,
            retentionPeriod: Duration.days(FAILURE_RETENTION_DAYS)
        });

        const role: Role = new Role(this, 'Role', {
            roleName: `vera-off-hours-${props.environmentName}`,
            assumedBy: new ServicePrincipal('scheduler.amazonaws.com')
        });
        role.addToPolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['ecs:UpdateService'],
                resources: [`arn:aws:ecs:${props.region}:${props.account}:service/${props.clusterName}/*`]
            })
        );
        this.failures.grantSendMessages(role);

        this.schedule('ServiceStop', SERVICE_STOP, this.serviceInput(props, 0), role);
        this.schedule('ServiceStart', SERVICE_START, this.serviceInput(props, 1), role);
    }

    private serviceInput(props: OffHoursScheduleProps, desiredCount: number): string {
        return JSON.stringify({ Cluster: props.clusterName, Service: props.serviceName, DesiredCount: desiredCount });
    }

    private schedule(id: string, expression: string, input: string, role: Role): CfnSchedule {
        return new CfnSchedule(this, id, {
            flexibleTimeWindow: { mode: 'OFF' },
            scheduleExpression: expression,
            scheduleExpressionTimezone: TIMEZONE,
            state: 'ENABLED',
            target: {
                arn: ECS_UPDATE,
                roleArn: role.roleArn,
                input,
                retryPolicy: { maximumEventAgeInSeconds: 3600, maximumRetryAttempts: RETRY_ATTEMPTS },
                deadLetterConfig: { arn: this.failures.queueArn }
            }
        });
    }
}
